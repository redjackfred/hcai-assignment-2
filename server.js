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
const QUALTRICS_SURVEY_URL = 'https://usfca.qualtrics.com/jfe/form/SV_8kSV6w3WpE3X5ga';
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
    const selectedReadLevel = storySettings.readLevel || 'medium';
    const readLevelInstructions = {
      easy:   'Use simple vocabulary and short explanations suitable for young children (grades 1–3). Avoid complex words.',
      medium: 'Use moderate vocabulary suitable for middle-grade readers (grades 4–6).',
      hard:   'Use sophisticated vocabulary, varied sentence structures, and rich literary language suitable for advanced readers.',
    };
    const storyLengthConfig = {
      easy: { sentenceMultiplier: 6, minWords: 90, maxWords: 180, paragraphs: 3 },
      medium: { sentenceMultiplier: 8, minWords: 160, maxWords: 300, paragraphs: 4 },
      hard: { sentenceMultiplier: 10, minWords: 260, maxWords: 480, paragraphs: 5 },
    };
    const readLevel = readLevelInstructions[selectedReadLevel] || readLevelInstructions.medium;
    const wordLimit = Number(storySettings.sentenceLength) || 20;
    const sentenceLength = `Each sentence must not exceed ${wordLimit} words.`;
    const lengthConfig = storyLengthConfig[selectedReadLevel] || storyLengthConfig.medium;
    const targetWordCount = Math.min(
      lengthConfig.maxWords,
      Math.max(lengthConfig.minWords, wordLimit * lengthConfig.sentenceMultiplier)
    );
    const storyLengthInstruction = `Because the read level is "${selectedReadLevel}", keep the full story around ${targetWordCount} words total and organize it into about ${lengthConfig.paragraphs} short paragraphs. Lower read levels must produce shorter stories than higher read levels.`;
    const themeLine = storySettings.theme
      ? `The selected theme or themes are mandatory and must appear clearly in the story: ${storySettings.theme}. Make at least one selected theme central to the main character, setting, or plot. Do not replace the selected theme with an unrelated one.`
      : 'If no theme is selected, choose a child-friendly imaginative theme that fits the request.';

    console.log('[buildSystemPrompt] readLevel ->', selectedReadLevel, '|', readLevel);
    console.log('[buildSystemPrompt] sentenceLength -> max %d words', wordLimit);
    console.log('[buildSystemPrompt] targetWordCount -> %d', targetWordCount);
    console.log('[buildSystemPrompt] theme ->', storySettings.theme);

    return `You are a creative story-telling AI. Generate engaging, imaginative stories based on the user's request.
${readLevel}
${sentenceLength}
${storyLengthInstruction}
${themeLine}
Always prioritize the current story request and the currently selected themes over any earlier conversation context.
Make the story complete, with a clear ending instead of stopping mid-scene.
Format your response using Markdown.
Start with a short story title as a Markdown heading.
Use short paragraphs with clear spacing between them, and avoid large walls of text.
If reference materials are provided, incorporate relevant details naturally into the story.

### Reference Materials ###
${contextText}`;
  }

  // System 1 baseline story prompt
  return `You are a creative story-telling AI. Generate an engaging, imaginative story based on the user's request.
Start with a short story title as a Markdown heading.
Keep the story complete with a clear ending.
Use short paragraphs with clear spacing between them.
Format your response using Markdown.
If reference materials are provided, incorporate relevant details naturally into the story.

### Reference Materials ###
${contextText}`;
}

function shouldUseStoryHistory(message) {
  const normalizedMessage = (message || '').trim().toLowerCase();

  if (!normalizedMessage) {
    return false;
  }

  const followUpPatterns = [
    /\bcontinue\b/,
    /\bkeep going\b/,
    /\bgo on\b/,
    /\bwhat happens next\b/,
    /\bnext (chapter|part|scene)\b/,
    /\bfinish the story\b/,
    /\bmake (the|her|him|it|them)\b/,
    /\badd (a|an|the)\b/,
    /\bchange (the|her|his|its|their|this)\b/,
    /\brewrite (the|this)\b/,
    /\bedit (the|this)\b/,
    /\bmodify (the|this)\b/,
    /\breplace (the|this)\b/,
    /\bremove (the|this)\b/,
  ];

  return followUpPatterns.some((pattern) => pattern.test(normalizedMessage));
}

function buildStoryUserPrompt({ message, storySettings, useStoryHistory, historyWasRequested }) {
  const promptSections = [
    useStoryHistory
      ? 'Use the recent conversation as the current story context. Continue or revise that story according to the request below.'
      : (historyWasRequested
        ? 'No earlier story context is available, so create a fresh standalone story that best fits the request below.'
        : 'Create a fresh standalone story. Do not continue any previous story.'),
    `Story request: ${message}`,
    `Required read level: ${storySettings?.readLevel || 'medium'}`,
    `Maximum words per sentence: ${Number(storySettings?.sentenceLength) || 20}`,
  ];

  if (storySettings?.theme) {
    promptSections.push(`Required themes: ${storySettings.theme}. These themes must appear explicitly in the story.`);
  }

  return promptSections.join('\n');
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

app.post('/redirect-to-survey', (req, res) => {
  const participantID = (req.body?.participantID || '').trim();

  if (!participantID) {
    return res.status(400).send('participantID is required');
  }

  const surveyUrl = new URL(QUALTRICS_SURVEY_URL);
  surveyUrl.searchParams.set('participantID', participantID);

  res.send(surveyUrl.toString());
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

    const isStoryMode = Number(systemID) % 2 === 0 && storySettings;
    const systemPrompt = buildSystemPrompt({ systemID, storySettings, contextText });
    const storyTokenBudgets = {
      easy: 320,
      medium: 520,
      hard: 760,
    };
    const storyReadLevel = storySettings?.readLevel || 'medium';
    const maxTokens = isStoryMode
      ? (storyTokenBudgets[storyReadLevel] || storyTokenBudgets.medium)
      : 1000;
    const availableHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
    const storyHistoryRequested = isStoryMode && shouldUseStoryHistory(message);
    const useStoryHistory = storyHistoryRequested && availableHistory.length > 0;
    const priorMessages = isStoryMode
      ? (useStoryHistory ? availableHistory : [])
      : availableHistory;
    const currentUserMessage = isStoryMode
      ? buildStoryUserPrompt({
        message,
        storySettings,
        useStoryHistory,
        historyWasRequested: storyHistoryRequested,
      })
      : message;
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: 'system', content: systemPrompt },
        ...priorMessages,
        { role: 'user', content: currentUserMessage }
      ],
      max_tokens: maxTokens,
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

    const isStory = botResponse.trimStart().startsWith('#');

    res.json({
      response: botResponse,
      interactionId: chat_event._id,
      isStory,
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

app.post('/rate-story', async (req, res) => {
  const { interactionId, rating } = req.body;
  try {
    if (!interactionId || rating == null) {
      return res.status(400).json({ error: 'interactionId and rating are required' });
    }
    await Interaction.findByIdAndUpdate(interactionId, { userRating: Number(rating) });
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving rating:', error.message);
    res.status(500).json({ error: 'Server Error' });
  }
});

app.post('/story-action', async (req, res) => {
  const { interactionId, action, roundsToAccept } = req.body;
  try {
    if (!interactionId || !action) {
      return res.status(400).json({ error: 'interactionId and action are required' });
    }
    const update = { userAction: action };
    if (action === 'accept' && roundsToAccept != null) {
      update.roundsToAccept = Number(roundsToAccept);
    }
    await Interaction.findByIdAndUpdate(interactionId, update);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error saving story action:', error.message);
    res.status(500).json({ error: 'Server Error' });
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
