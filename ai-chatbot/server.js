const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');

// Serves static files from the "public" folder
app.use(express.static(path.join(__dirname, 'public')));

// 3. Middleware to parse JSON data
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// POST /chat
app.post('/chat', (req, res) => {
  const { message, retrievalMethod } = req.body || {};
  const botResponse = "Message Received!";

  if (!message || !retrievalMethod) {
    return res.status(400).json({
      error: 'Both "message" and "retrievalMethod" are required.',
    });
  }

  console.log('User message:', message);
  console.log('Retrieval method:', retrievalMethod);

  console.log(`Bot:${botResponse}`);

  res.json({
    message,
    response: botResponse,
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
