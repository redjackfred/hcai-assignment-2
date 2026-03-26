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

////////////////////OpenAI CODE BELOW////////////////////
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// POST /chat
app.post('/chat', async (req, res) => {
  let { participantID, message, retrievalMethod } = req.body || {};
  try {

    if (!message.trim() || !retrievalMethod) {
      return res.status(400).json({
        error: 'Both "message" and "retrievalMethod" are required.',
      });
    }

    const relevantChunks = await retrievalService.retrieve(message, { topK: 3, method: retrievalMethod, minScore: retrievalMethod === 'tfidf' ? 0.1 : 0.3 });

    const contextText = relevantChunks.length > 0
      ? relevantChunks.map(c => `[Source: ${c.documentName}]\n${c.chunkText}`).join("\n\n---\n\n")
      : "No relevant reference materials found.";


    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: 'system',
          content: `You are a professional assistant. Answer the user's questions based on the "Reference Materials" provided below. 
          If the materials do not contain relevant information, state this honestly.
          
          ### Reference Materials ###
          ${contextText}`
        },
        { role: 'user', content: message }
      ],
      max_tokens: 300,
    });

    const botResponse = response.choices[0].message.content.trim();
    const topScore = relevantChunks.length > 0 ? relevantChunks[0].relevanceScore : 0;
    const chat_event = new Interaction({
      participantID,
      userInput: message,
      botResponse,
      retrievalMethod: retrievalMethod,
      // Map retrievalService fields to Interaction Schema fields
      retrievedDocuments: relevantChunks.map(chunk => ({
        docName: chunk.documentName, // Maps 'documentName' to 'docName'
        chunkIndex: chunk.chunkIndex,
        chunkText: chunk.chunkText,
        relevanceScore: chunk.relevanceScore
      })),
      confidenceMetrics: {
        overallConfidence: Math.min(topScore * 1.2, 1), // Example weight
        retrievalConfidence: topScore,
        responseConfidence: 0.9, // Fixed or derived from Logprobs if enabled
        retrievalMethod: retrievalMethod
      }
    });
    await chat_event.save();

    res.json({
      message,
      response: botResponse,
      sources: relevantChunks.length
    });
  } catch (e) {
    console.error('Error processing chat request:', e);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Post /log-event
app.post('/log-event', async (req, res) => {
  const { participantID, eventType, elementName } = req.body;
  try {
    if (!participantID || !eventType || !elementName) {
      return res.status(400).json({ error: 'participantID, eventType, elementName, and timestamp are required' });
    }
    // Log the event to MongoDB
    const event = new EventLog({ participantID, eventType, elementName });
    await event.save();
    res.status(200).send('Event logged successfully');
  } catch (error) {
    console.error('Error logging event:', error.message);
    res.status(500).send('Server Error');
  }
});

// Post /history
app.post('/history', async (req, res) => {
  const { participantID } = req.body;
  try {
    if (!participantID) {
      return res.status(400).json({ error: 'participantID is required' });
    }
    const events = await Interaction.find({ participantID }).sort({ timestamp: 1 });
    res.status(200).json(events);
  } catch (error) {
    console.error('Error logging event:', error.message);
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
