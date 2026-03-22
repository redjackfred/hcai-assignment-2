const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const OpenAI = require('openai');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
//////////////////// MongoDB CODE BELOW////////////////////
const Interaction = require('./models/Interaction');
const EventLog = require('./models/EventLog');

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

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


app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
