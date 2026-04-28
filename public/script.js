const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalSelect = document.getElementById("retrieval-select");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const readLevelSlider = document.getElementById("read-level-slider");
const sentenceLengthSlider = document.getElementById("sentence-length-slider");
const themeCustomInputField = document.getElementById("theme-custom-input");
const themeChipButtons = document.querySelectorAll(".theme-chip");

const urlParams = new URLSearchParams(window.location.search);
const participantID = urlParams.get("participantID") || localStorage.getItem("participantID") || "anonymous";
const systemID = urlParams.get("systemID") || localStorage.getItem("systemID") || "1";

localStorage.setItem("participantID", participantID);
localStorage.setItem("systemID", systemID);

const HISTORY_LIMIT = 5;
const conversationHistory = [];

function addMessage(text, type = "user") {
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${type}-wrapper`;

  const bubble = document.createElement("div");
  bubble.className = `message-bubble ${type}-message`;

  if (type === "bot") {
    bubble.innerHTML = marked.parse(text);
  } else {
    bubble.textContent = text;
  }

  wrapper.appendChild(bubble);
  messagesContainer.appendChild(wrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function sendMessage() {
  const userMessage = inputField.value.trim();
  const retrievalMethod = retrievalSelect.value;

  if (!userMessage) {
    alert("Please enter a message before sending.");
    return;
  }

  addMessage(userMessage, "user");
  inputField.value = "";

  const recentHistory = conversationHistory.slice(-HISTORY_LIMIT);
  const storySettings = window.getStorySettings ? window.getStorySettings() : null;

  fetch("/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: userMessage,
      retrievalMethod,
      participantID,
      systemID,
      conversationHistory: recentHistory,
      storySettings,
    }),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      const botReply = data.response || "No response from bot.";
      addMessage(botReply, "bot");
      displayEvidence(data.retrievedDocuments, data.confidenceMetrics);
      conversationHistory.push({ role: "user", content: userMessage });
      conversationHistory.push({ role: "assistant", content: botReply });
    })
    .catch((error) => {
      console.error("Failed to send message to server:", error);
    });
}

async function loadDocuments() {
  const response = await fetch("/documents");
  const docs = await response.json();
  const documentsList = document.getElementById("uploaded-docs");

  if (!documentsList) {
    return;
  }

  documentsList.innerHTML = "";
  docs.forEach((doc) => {
    const item = document.createElement("li");
    item.textContent = `${doc.filename} - ${doc.processingStatus}`;
    documentsList.appendChild(item);
  });
}

function displayEvidence(retrievedDocuments, confidenceMetrics) {
  const confidenceDisplay = document.getElementById("confidence-display");
  const evidenceList = document.getElementById("evidence-list");

  if (confidenceMetrics) {
    const percentage = (confidenceMetrics.overallConfidence * 100).toFixed(1);
    confidenceDisplay.textContent = `Confidence: ${percentage}%`;
  } else {
    confidenceDisplay.textContent = "Confidence: —";
  }

  evidenceList.innerHTML = "";

  if (retrievedDocuments && retrievedDocuments.length > 0) {
    retrievedDocuments.forEach((doc) => {
      const item = document.createElement("li");
      const score = doc.relevanceScore.toFixed(3);
      const preview = doc.chunkText.length > 120 ? `${doc.chunkText.slice(0, 120)}…` : doc.chunkText;
      item.innerHTML = `<strong>${doc.docName}</strong> <span class="evidence-score">(score: ${score})</span><br><small>${preview}</small>`;
      evidenceList.appendChild(item);
    });
    return;
  }

  const emptyItem = document.createElement("li");
  emptyItem.textContent = "No evidence retrieved.";
  evidenceList.appendChild(emptyItem);
}

function logEvent(eventType, elementName) {
  fetch("/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantID, systemID, eventType, elementName }),
  }).catch((error) => {
    console.error("Failed to log event:", error);
  });
}

async function loadConversationHistory() {
  try {
    const response = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID }),
    });
    const data = await response.json();
    const allHistory = Array.isArray(data) ? data : data.history;

    if (!allHistory || allHistory.length === 0) {
      return;
    }

    const recentHistory = allHistory.slice(-HISTORY_LIMIT);
    recentHistory.forEach(({ userInput, botResponse }) => {
      addMessage(userInput, "user");
      addMessage(botResponse, "bot");
      conversationHistory.push({ role: "user", content: userInput });
      conversationHistory.push({ role: "assistant", content: botResponse });
    });
  } catch (error) {
    console.error("[history] Failed to load chat history:", error);
  }
}

loadDocuments();
loadConversationHistory();

sendBtn.addEventListener("click", sendMessage);

inputField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

retrievalSelect.addEventListener("change", (event) => {
  addMessage(`System: Retrieval method set to ${event.target.value}`, "system");
});

uploadBtn.addEventListener("click", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];

  if (!file) {
    alert("Choose a file first.");
    return;
  }

  const formData = new FormData();
  formData.append("document", file);

  const response = await fetch("/upload-document", { method: "POST", body: formData });
  const data = await response.json();

  if (!response.ok) {
    alert(`Upload failed: ${data.error || "Unknown error"}`);
    return;
  }

  alert(`Uploaded "${data.filename}" (${data.chunkCount} chunks)`);
  await loadDocuments();
});

const trackedElements = [
  { el: sendBtn, name: "send-btn" },
  { el: inputField, name: "user-input" },
  { el: retrievalSelect, name: "retrieval-select" },
  { el: uploadBtn, name: "upload-btn" },
  { el: readLevelSlider, name: "read-level-slider" },
  { el: sentenceLengthSlider, name: "sentence-length-slider" },
  { el: themeCustomInputField, name: "theme-custom-input" },
];

trackedElements.forEach(({ el, name }) => {
  el?.addEventListener("click", () => logEvent("click", name));
  el?.addEventListener("mouseenter", () => logEvent("hover", name));
  el?.addEventListener("focus", () => logEvent("focus", name));
});

themeChipButtons.forEach((button) => {
  button.addEventListener("click", () => {
    logEvent("click", "theme-button");
  });
});

themeCustomInputField?.addEventListener("change", () => {
  logEvent("change", "theme-custom-input");
});
