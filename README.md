# hcai-assignment-2
A chatbot interface using HTML, CSS and JavaScript

## Setup & Run

From the project root:

```bash
# Install dependencies
npm install

# Development (auto-restart)
npm run dev

# Or run normally
npm start
```

Then open `http://localhost:3000` in your browser.

## Environment Variables

Create `.env`:

```
OPENAI_API_KEY=your_openai_api_key
MONGO_URI=your_mongodb_connection_string
```

## Features

- Upload PDF or TXT documents for retrieval
- Two retrieval methods: Semantic (embeddings) and TF-IDF (keyword)
- RAG: retrieved document chunks are injected into the OpenAI prompt
- Displays retrieved evidence with relevance scores and confidence metrics
- Participant tracking and chat history via MongoDB
- Bot responses rendered as Markdown
