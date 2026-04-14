const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const OpenAI = require('openai');
const mongoose = require('mongoose');
require('dotenv').config();
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
//////////////////// MongoDB CODE BELOW////////////////////
const Interaction = require('./models/Interaction');
const EventLog = require('./models/EventLog');
const Document = require('./models/Document');
const documentProcessor = require("./services/documentProcessor");
const embeddingService = require('./services/embeddingService');
const retrievalService = require('./services/retrievalService');
const confidenceCalculator = require('./services/confidenceCalculator');

////////////////////OpenAI CODE BELOW////////////////////
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildSystemPrompt({ systemID, storySettings, contextText }) {
  console.log('[buildSystemPrompt] systemID=%s storySettings=%s', systemID, JSON.stringify(storySettings));
  if (Number(systemID) % 2 === 0 && storySettings) {
    const readLevelInstructions = {
      easy:   'Use simple vocabulary and short explanations suitable for young children (grades 1–3). Avoid complex words.',
      medium: 'Use moderate vocabulary suitable for middle-grade readers (grades 4–6).',
      hard:   'Use sophisticated vocabulary, varied sentence structures, and rich literary language suitable for advanced readers.',
    };
    const readLevel = readLevelInstructions[storySettings.readLevel] || readLevelInstructions.medium;
    const wordLimit = Number(storySettings.sentenceLength) || 20;
    const sentenceLength = `Each sentence must not exceed ${wordLimit} words.`;
    const themeLine = storySettings.theme
      ? `Weave the following themes or elements naturally into the story: ${storySettings.theme}.`
      : '';

    console.log('[buildSystemPrompt] readLevel ->', storySettings.readLevel, '|', readLevel);
    console.log('[buildSystemPrompt] sentenceLength -> max %d words', wordLimit);
    console.log('[buildSystemPrompt] theme ->', storySettings.theme);

    return `You are a creative story-telling AI. Generate engaging, imaginative stories based on the user's request.
${readLevel}
${sentenceLength}
${themeLine}
Format your response using Markdown. If reference materials are provided, incorporate relevant details naturally into the story.

### Reference Materials ###
${contextText}`;
  }

  // Default system 1 prompt
  return `You are a professional assistant. Answer the user's questions based on the "Reference Materials" provided below.
If the materials do not contain relevant information, state this honestly.
Format your response using Markdown (use headings, bullet points, bold, or code blocks where appropriate).

### Reference Materials ###
${contextText}`;
}

// Serves static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// 3. Middleware to parse JSON data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.get('/chat2', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat2.html'));
});

// POST /chat
app.post('/chat', async (req, res) => {
  let { participantID, message, retrievalMethod, systemID, conversationHistory, storySettings } = req.body || {};
  console.log('[POST /chat] participantID=%s systemID=%s retrievalMethod=%s storySettings=%s', participantID, systemID, retrievalMethod, JSON.stringify(storySettings));
  try {

    if (!message.trim() || !retrievalMethod) {
      return res.status(400).json({
        error: 'Both "message" and "retrievalMethod" are required.',
      });
    }

    const relevantChunks = await retrievalService.retrieve(message, { topK: 3, method: retrievalMethod, minScore: retrievalMethod === 'tfidf' ? 0.1 : 0.3 });
    console.log(`[retrieval] method=${retrievalMethod}, found=${relevantChunks.length} chunks`);
    relevantChunks.forEach((c, i) => console.log(`  [${i}] doc="${c.documentName}" score=${c.relevanceScore?.toFixed(4)} chunkIndex=${c.chunkIndex}`));

    const contextText = relevantChunks.length > 0
      ? relevantChunks.map(c => `[Source: ${c.documentName}]\n${c.chunkText}`).join("\n\n---\n\n")
      : "No relevant reference materials found.";

    const systemPrompt = buildSystemPrompt({ systemID, storySettings, contextText });

    const priorMessages = Array.isArray(conversationHistory) ? conversationHistory : [];
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: 'system', content: systemPrompt },
        ...priorMessages,
        { role: 'user', content: message }
      ],
      max_tokens: 300,
    });

    const botResponse = response.choices[0].message.content.trim();

    const retrievedDocuments = relevantChunks.map(chunk => ({
      docName: chunk.documentName,
      chunkIndex: chunk.chunkIndex,
      chunkText: chunk.chunkText,
      relevanceScore: chunk.relevanceScore
    }));

    const confidenceMetrics = confidenceCalculator.calculate({
      retrievedDocs: relevantChunks,
      retrievalMethod
    });

    const chat_event = new Interaction({
      participantID,
      systemID: systemID ? Number(systemID) : null,
      userInput: message,
      botResponse,
      retrievalMethod,
      retrievedDocuments,
      confidenceMetrics
    });
    await chat_event.save();

    res.json({
      response: botResponse,
      retrievedDocuments,
      confidenceMetrics
    });
  } catch (e) {
    console.error('Error processing chat request:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Post /log-event
app.post('/log-event', async (req, res) => {
  const { participantID, systemID, eventType, elementName } = req.body;
  try {
    if (!participantID || !eventType || !elementName) {
      return res.status(400).json({ error: 'participantID, eventType, elementName, and timestamp are required' });
    }
    // Log the event to MongoDB
    const event = new EventLog({ participantID, systemID: systemID ? Number(systemID) : null, eventType, elementName });
    await event.save();
    res.status(200).send('Event logged successfully');
  } catch (error) {
    console.error('Error logging event:', error.message);
    res.status(500).send('Server Error');
  }
});

// Post /history — returns last 5 interactions for the participant
app.post('/history', async (req, res) => {
  const { participantID } = req.body;
  try {
    if (!participantID) {
      return res.status(400).json({ error: 'participantID is required' });
    }
    const interactions = await Interaction
      .find({ participantID })
      .sort({ timestamp: -1 })
      .limit(5)
      .lean();
    // Return in chronological order
    res.status(200).json(interactions.reverse());
  } catch (error) {
    console.error('Error fetching history:', error.message);
    res.status(500).send('Server Error');
  }
});

////////////////////Doc Process CODE BELOW////////////////////
// Save uploaded files so documentProcessor.js can read them
const upload = multer({ dest: path.join(__dirname, 'uploads') });
app.post("/upload-document", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const processed = await documentProcessor.processDocument(req.file);
    const chunksWithEmbeddings = await embeddingService.generateEmbeddings(processed.chunks);

    const document = new Document({
      filename: req.file.originalname,
      text: processed.fullText,
      chunks: chunksWithEmbeddings,
      processingStatus: "completed",
      processedAt: new Date()
    });

    await document.save();

    await retrievalService.rebuildIndex();

    res.json({
      status: "ok",
      filename: req.file.originalname,
      chunkCount: chunksWithEmbeddings.length
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: 'Failed to upload document' });
  }
});

app.get("/documents", async (req, res) => {
  const docs = await Document.find({})
    .select("_id filename processingStatus processedAt")
    .sort({ processedAt: -1 });
  res.json(docs);
});

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('Connected to MongoDB');
    await retrievalService.initialize();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch(err => console.error(err));
////////////////////End Doc Process CODE BELOW////////////////////
