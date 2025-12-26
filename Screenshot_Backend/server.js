//server.js 

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3000;

// ⚠️ REPLACE WITH YOUR ACTUAL GEMINI API KEY
const GEMINI_API_KEY = 'AIzaSyCsOO3I98lRh57QSJjTjO8iijv1_HEcxV4';

// Initialize Gemini AI with vision model
let textModel = null;
let visionModel = null;

if (GEMINI_API_KEY) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    textModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    visionModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    console.log('✅ Gemini AI models initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize Gemini AI:', error);
  }
}

// Middleware with detailed CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Configure multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running',
    ai: textModel ? 'Google Gemini 2.0 Flash' : 'Fallback (No API Key)',
    visionEnabled: !!visionModel,
    textEnabled: !!textModel,
    timestamp: new Date().toISOString(),
    endpoints: { 
      summarize: 'POST /summarize',
      test: 'GET /test'
    }
  });
});

// Test endpoint
app.get('/test', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is responding',
    models: {
      vision: !!visionModel,
      text: !!textModel
    }
  });
});

// Main endpoint with vision analysis
app.post('/summarize', upload.single('image'), async (req, res) => {
  try {
    console.log('📸 Received screenshot request');
    console.log('Request headers:', req.headers);
    
    if (!req.file) {
      console.error('❌ No image file in request');
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('✅ Image received, size:', req.file.size, 'bytes');
    console.log('Image type:', req.file.mimetype);

    // Try vision-based analysis first (more accurate)
    if (visionModel) {
      console.log('🔍 Using Gemini Vision for direct image analysis...');
      try {
        const analysis = await analyzeImageWithVision(req.file.buffer, req.file.mimetype);
        console.log('✅ Vision analysis completed successfully');
        
        return res.json({
          success: true,
          summary: analysis, // This is now a structured object
          method: 'vision',
          originalTextLength: 0
        });
      } catch (visionError) {
        console.error('❌ Vision analysis failed:', visionError.message);
        console.error('Full error:', visionError);
      }
    } else {
      console.warn('⚠️ Vision model not available');
    }

    // Fallback to OCR + text analysis
    console.log('📝 Starting OCR fallback...');
    const extractedText = await performOCR(req.file.buffer);
    
    if (!extractedText || extractedText.trim().length === 0) {
      console.error('❌ No text extracted from image');
      return res.status(400).json({ 
        error: 'No text found in image',
        summary: 'No readable text was detected in the screenshot.' 
      });
    }

    console.log('✅ OCR completed, extracted text length:', extractedText.length);
    console.log('🤖 Starting text analysis...');
    
    const analysis = await analyzeWithGemini(extractedText);
    console.log('✅ Analysis completed');

    res.json({
      success: true,
      summary: analysis,
      method: 'ocr+text',
      originalTextLength: extractedText.length,
      extractedText: extractedText.substring(0, 500)
    });

  } catch (error) {
    console.error('💥 Error processing screenshot:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: 'Failed to process screenshot',
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Vision-based analysis with structured JSON output
async function analyzeImageWithVision(imageBuffer, mimeType) {
  try {
    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType || 'image/png'
      }
    };

    const prompt = `You are an AI assistant specialized in analyzing screenshots and images. Provide a structured, concise analysis.

Analyze this screenshot/image and respond in this EXACT JSON format:

{
  "contentType": "Brief description (e.g., 'API Keys Dashboard', 'Code Editor', 'Article Page')",
  "keyInsights": [
    "First key insight in one sentence",
    "Second key insight in one sentence",
    "Third key insight in one sentence"
  ],
  "importantDetails": [
    "Important detail 1",
    "Important detail 2",
    "Important detail 3"
  ],
  "context": "One sentence about what the user is viewing/doing",
  "technicalElements": ["element1", "element2"] // Only if technical content like code, APIs, errors
}

Keep each insight to 1 sentence maximum. Focus on what's actually useful. Be concise and specific.`;

    const result = await visionModel.generateContent([prompt, imagePart]);
    const response = await result.response;
    const rawText = response.text().trim();
    
    // Try to parse JSON response
    try {
      // Remove markdown code blocks if present
      const cleanJson = rawText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;
    } catch (parseError) {
      console.warn('Failed to parse JSON, returning raw text');
      // Fallback: return structured format from raw text
      return {
        contentType: "Screenshot Analysis",
        keyInsights: [rawText.substring(0, 200)],
        importantDetails: [],
        context: "Analysis completed",
        technicalElements: []
      };
    }
    
  } catch (error) {
    console.error('Vision API Error:', error);
    throw error;
  }
}

// OCR function
async function performOCR(imageBuffer) {
  try {
    const result = await Tesseract.recognize(
      imageBuffer,
      'eng',
      {
        logger: m => {
          if (m.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      }
    );
    return result.data.text;
  } catch (error) {
    console.error('OCR Error:', error);
    throw new Error('OCR processing failed');
  }
}

// Enhanced text analysis with structured JSON output
async function analyzeWithGemini(text) {
  try {
    if (!textModel) {
      console.warn('⚠️ Gemini API key not set, using fallback analysis');
      return simpleRuleBasedSummary(text);
    }

    const prompt = `You are an AI assistant specialized in analyzing text from screenshots. Provide a structured, concise analysis.

Text extracted from screenshot:
${text}

Respond in this EXACT JSON format:

{
  "contentType": "Brief description of content type (e.g., 'Documentation', 'Code Snippet', 'Chat Conversation')",
  "keyInsights": [
    "First key insight in one sentence",
    "Second key insight in one sentence",
    "Third key insight in one sentence"
  ],
  "importantDetails": [
    "Important detail 1",
    "Important detail 2",
    "Important detail 3"
  ],
  "context": "One sentence about what this content is about",
  "technicalElements": ["element1", "element2"] // Only if technical content
}

Keep each insight to 1 sentence maximum. Be concise and specific. Extract only what's truly important.`;

    const result = await textModel.generateContent(prompt);
    const response = await result.response;
    const rawText = response.text();
    
    // Try to parse JSON response
    try {
      const cleanJson = rawText.replace(/```json\n?|\n?```/g, '').trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;
    } catch (parseError) {
      console.warn('Failed to parse JSON, returning raw text');
      return {
        contentType: "Text Analysis",
        keyInsights: [rawText.substring(0, 200)],
        importantDetails: [],
        context: "Analysis completed",
        technicalElements: []
      };
    }
    
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    console.log('Falling back to simple analysis...');
    return simpleRuleBasedSummary(text);
  }
}

// Improved fallback summarization
function simpleRuleBasedSummary(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  
  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  const summary = sentences.slice(0, 3).join(' ').trim();
  
  // Extract key terms
  const words = cleaned.toLowerCase().split(/\s+/);
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'was', 'were']);
  const keyWords = words
    .filter(w => w.length > 4 && !commonWords.has(w))
    .slice(0, 5);
  
  // Return structured format
  return {
    contentType: "Text Content",
    context: cleaned.length <= 200 ? cleaned : summary,
    keyInsights: [
      sentences[0] || "Content extracted from screenshot",
      sentences[1] || "Analysis in progress"
    ].filter(Boolean),
    importantDetails: keyWords.length > 0 ? [`Key terms: ${keyWords.join(', ')}`] : [],
    technicalElements: []
  };
}

// Start server
app.listen(PORT, () => {
  console.log(`
=================================
Screenshot Analysis Server Running
=================================
AI Model: ${textModel ? 'Google Gemini 2.0 Flash' : 'Fallback (Set API Key)'}
Vision Analysis: ${visionModel ? 'Enabled' : 'Disabled'}
Port: ${PORT}
URL: http://localhost:${PORT}
Endpoint: http://localhost:${PORT}/summarize
=================================
${!textModel ? '⚠️  Set GEMINI_API_KEY in server.js for AI analysis' : 'Ready to analyze screenshots!'}
=================================
  `);
});