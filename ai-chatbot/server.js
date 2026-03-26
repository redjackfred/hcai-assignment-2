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
app.post('/chat', async(req, res) => {
  let { participantID, message, retrievalMethod } = req.body || {};
  const botResponse = "Message Received!";
  try{

    if (!message.trim() || !retrievalMethod) {
      return res.status(400).json({
        error: 'Both "message" and "retrievalMethod" are required.',
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{role: 'user', content: message}],
      max_tokens: 100,
    });

    let botResponse = response.choices[0].message.content.trim();
    const chat_event = new Interaction({participantID, userInput: message, botResponse});
    await chat_event.save();

    res.json({
      message,
      response: botResponse,
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
    const event = new EventLog({participantID, eventType, elementName});
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
    const events = await Interaction.find({participantID}).sort({timestamp: 1});
    res.status(200).json(events);
  } catch (error) {
    console.error('Error logging event:', error.message);
    res.status(500).send('Server Error');
  }
});

////////////////////Doc Process CODE BELOW////////////////////
// Save uploaded files so documentProcessor.js can read them
const upload = multer({ dest: path.join(__dirname, 'uploads') });
app.post("/upload-document", upload.single("document") , async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const processed = await documentProcessor.processDocument(req.file);
    const chunksWithEmbeddings = await embeddingService.generateEmbeddings(processed.chunks);

    const document = new Document({
      filename: req.file.originalname,
      text: processed.fullText,
      processingStatus: "processing"
    });

    document.chunks = chunksWithEmbeddings;
    document.processingStatus = "completed";
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
