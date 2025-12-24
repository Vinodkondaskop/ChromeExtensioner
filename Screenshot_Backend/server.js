//server.js 

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const Tesseract = require('tesseract.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = 3000;

// ⚠️ REPLACE WITH YOUR ACTUAL GEMINI API KEY
const GEMINI_API_KEY = 'AIzaSyDkOjQn2H-CIOP-uK3mp2a8Z11X9SnSirg';

// Initialize Gemini AI with vision model
let textModel = null;
let visionModel = null;

if (GEMINI_API_KEY) {
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  textModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  visionModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  console.log('Gemini AI models initialized successfully');
} else {
  console.error('Gemini API Key is missing!');
}

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Health check
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running',
    ai: textModel ? 'gemini-2.5-flash' : 'Fallback (No API Key)',
    endpoints: { summarize: 'POST /summarize' }
  });
});

// Main endpoint with vision analysis
app.post('/summarize', upload.single('image'), async (req, res) => {
  try {
    console.log('Received screenshot request');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('Image received, size:', req.file.size, 'bytes');

    // Try vision-based analysis first (more accurate)
    if (visionModel) {
      console.log('Using Gemini Vision for direct image analysis...');
      try {
        const analysis = await analyzeImageWithVision(req.file.buffer, req.file.mimetype);
        
        return res.json({
          success: true,
          summary: analysis,
          method: 'vision',
          originalTextLength: 0
        });
      } catch (visionError) {
        console.error('Vision analysis failed, falling back to OCR:', visionError.message);
      }
    }

    // Fallback to OCR + text analysis
    console.log('Starting OCR...');
    const extractedText = await performOCR(req.file.buffer);
    
    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({ 
        error: 'No text found in image',
        summary: 'No readable text was detected in the screenshot.' 
      });
    }

    console.log('OCR completed, extracted text length:', extractedText.length);
    console.log('Starting analysis...');
    
    const analysis = await analyzeWithGemini(extractedText);
    console.log('Analysis completed');

    res.json({
      success: true,
      summary: analysis,
      method: 'ocr+text',
      originalTextLength: extractedText.length,
      extractedText: extractedText.substring(0, 500)
    });

  } catch (error) {
    console.error('Error processing screenshot:', error);
    res.status(500).json({ 
      error: 'Failed to process screenshot',
      message: error.message 
    });
  }
});

// Vision-based analysis with custom prompt
async function analyzeImageWithVision(imageBuffer, mimeType) {
  try {
    const imagePart = {
      inlineData: {
        data: imageBuffer.toString('base64'),
        mimeType: mimeType || 'image/png'
      }
    };

    const prompt = `You are an AI assistant specialized in analyzing screenshots and images. Your task is to provide detailed, structured insights about the content shown.

Analyze this screenshot/image and provide:

1. **Content Type & Context**: Identify what type of content this is (webpage, app interface, document, code, chat, social media, etc.) and its general purpose or context.

2. **Main Information**: Extract and summarize the key information, main topics, or primary content visible in the image. Be specific about what's actually shown.

3. **Important Details**: Highlight any notable elements such as:
   - Specific data, numbers, or statistics
   - Important headings or titles
   - Key UI elements (buttons, forms, navigation)
   - Dates, times, or temporal information
   - User names, company names, or branding (if relevant)

4. **Actionable Insights**: If applicable, provide:
   - What action the user might be taking or viewing
   - Any potential next steps or important information to note
   - Context about why this screenshot might be significant

5. **Technical Elements** (if relevant): Note any code snippets, technical configurations, error messages, or system information visible.

Format your response in clear sections with headers. Be thorough but concise. Focus on providing genuine insight rather than just describing what's visible.`;

    const result = await visionModel.generateContent([prompt, imagePart]);
    const response = await result.response;
    return response.text().trim();
    
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

// Enhanced text analysis with custom prompt
async function analyzeWithGemini(text) {
  try {
    if (!textModel) {
      console.warn('⚠️ Gemini API key not set, using fallback analysis');
      return simpleRuleBasedSummary(text);
    }

    const prompt = `You are an AI assistant specialized in analyzing text extracted from screenshots. Your task is to provide detailed, structured insights about the content.

Text extracted from screenshot:
${text}

Analyze this text and provide:

1. **Content Type & Context**: Identify what type of content this is (article, code, conversation, documentation, form data, etc.) and its general purpose.

2. **Main Information**: Summarize the key information, main topics, or primary content. Be specific and extract the most important points.

3. **Important Details**: Highlight:
   - Specific data, numbers, or statistics
   - Important names, dates, or identifiers
   - Key technical terms or concepts
   - Any errors, warnings, or critical information

4. **Actionable Insights**: If applicable:
   - What action the user might be taking
   - Any important information they should note
   - Context about why this content might be significant

5. **Technical Elements** (if relevant): Note any code, commands, configurations, or technical details.

Format your response in clear sections with headers. Be thorough but concise. Focus on providing genuine insight and understanding, not just repeating the text.`;

    const result = await textModel.generateContent(prompt);
    const response = await result.response;
    const analysis = response.text();
    
    return analysis.trim();
    
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    console.log('Falling back to simple analysis...');
    return simpleRuleBasedSummary(text);
  }
}

// Improved fallback summarization
function simpleRuleBasedSummary(text) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  
  if (cleaned.length <= 200) {
    return `**Content Summary:**\n${cleaned}`;
  }

  const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [cleaned];
  const summary = sentences.slice(0, 4).join(' ').trim();
  
  let result = '**Content Overview:**\n';
  
  if (summary.length > 500) {
    result += summary.substring(0, 497) + '...';
  } else {
    result += summary;
  }
  
  // Try to extract key phrases
  const words = cleaned.toLowerCase().split(/\s+/);
  const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for']);
  const keyWords = words
    .filter(w => w.length > 4 && !commonWords.has(w))
    .slice(0, 5);
  
  if (keyWords.length > 0) {
    result += `\n\n**Key terms:** ${keyWords.join(', ')}`;
  }
  
  return result || 'Analysis: ' + cleaned.substring(0, 200) + '...';
}

// Start server
app.listen(PORT, () => {
  console.log(`
=================================
Screenshot Analysis Server Running
=================================
AI Model: ${textModel ? 'gemini-2.5-flash' : 'Fallback (Set API Key)'}
Vision Analysis: ${visionModel ? 'Enabled' : 'Disabled'}
Port: ${PORT}
URL: http://localhost:${PORT}
Endpoint: http://localhost:${PORT}/summarize
=================================
${!textModel ? '⚠️  Set GEMINI_API_KEY in server.js for AI analysis' : 'Ready to analyze screenshots!'}
=================================
  `);
});