const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalSelect = document.getElementById("retrieval-select");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// Participant ID — prefer URL query string, fall back to localStorage
const _urlParams = new URLSearchParams(window.location.search);
const participantID = _urlParams.get("participantID") || localStorage.getItem("participantID") || "anonymous";
const systemID = _urlParams.get("systemID") || null;

// In-memory conversation history for multi-turn context
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
  return wrapper;
}

function sendMessage() {
  const userMessage = inputField.value.trim();
  const retrievalMethod = retrievalSelect.value;

  if (!userMessage) {
    alert("Please enter a message before sending.");
    return;
  }

  const userWrapper = addMessage(userMessage, "user");
  inputField.value = "";

  const recentHistory = conversationHistory.slice(-HISTORY_LIMIT);

  fetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: userMessage, retrievalMethod, participantID, systemID, conversationHistory: recentHistory }),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      const botReply = data.response || "No response from bot.";
      const botWrapper = addMessage(botReply, "bot");
      displayEvidence(data.retrievedDocuments, data.confidenceMetrics);
      conversationHistory.push({ role: "user", content: userMessage });
      conversationHistory.push({ role: "assistant", content: botReply });
      if (data.isStory && data.interactionId) {
        addStoryWidgets(data.interactionId, userWrapper, botWrapper, userMessage);
      }
    })
    .catch((error) => {
      console.error("Failed to send message to server:", error);
    });
}

loadDocuments();

sendBtn.addEventListener("click", sendMessage);

inputField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    sendMessage();
  }
});

retrievalSelect.addEventListener("change", (event) => {
  const method = event.target.value;
  addMessage(`System: Retrieval method set to ${method}`, "system");
  console.log(`Retrieval method: ${method}`);
});

uploadBtn.addEventListener("click", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];

  if (!file) {
    alert("Choose a file first.");
    return;
  }

  console.log(`Selected file: ${file.name}`);

  const formData = new FormData();
  formData.append("document", file);

  const response = await fetch("/upload-document", {
    method: "POST",
    body: formData
  });

  const data = await response.json();

  if (!response.ok) {
    alert(`Upload failed: ${data.error || "Unknown error"}`);
    return;
  }

  alert(`Uploaded "${data.filename}" (${data.chunkCount} chunks)`);
  await loadDocuments();
});

async function loadDocuments() {
  const response = await fetch("/documents");
  const docs = await response.json();

  const documentsList = document.getElementById("uploaded-docs");
  if (!documentsList) return;
  documentsList.innerHTML = "";

  docs.forEach(doc => {
    const listItem = document.createElement("li");
    listItem.textContent = `${doc.filename} - ${doc.processingStatus}`;
    documentsList.appendChild(listItem);
  });

}


function displayEvidence(retrievedDocuments, confidenceMetrics) {
  const confidenceDisplay = document.getElementById("confidence-display");
  const evidenceList = document.getElementById("evidence-list");

  if (confidenceMetrics) {
    const pct = (confidenceMetrics.overallConfidence * 100).toFixed(1);
    confidenceDisplay.textContent = `Confidence: ${pct}%`;
  } else {
    confidenceDisplay.textContent = "Confidence: —";
  }

  evidenceList.innerHTML = "";
  if (retrievedDocuments && retrievedDocuments.length > 0) {
    retrievedDocuments.forEach(doc => {
      const li = document.createElement("li");
      const score = doc.relevanceScore.toFixed(3);
      const preview = doc.chunkText.length > 120 ? doc.chunkText.slice(0, 120) + "…" : doc.chunkText;
      li.innerHTML = `<strong>${doc.docName}</strong> <span class="evidence-score">(score: ${score})</span><br><small>${preview}</small>`;
      evidenceList.appendChild(li);
    });
  } else {
    const li = document.createElement("li");
    li.textContent = "No evidence retrieved.";
    evidenceList.appendChild(li);
  }
}

// Event logging
function logEvent(eventType, elementName) {
  fetch("/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantID, systemID, eventType, elementName }),
  }).catch((err) => console.error("Failed to log event:", err));
}

const trackedElements = [
  { el: sendBtn, name: "send-btn" },
  { el: inputField, name: "user-input" },
  { el: retrievalSelect, name: "retrieval-select" },
  { el: uploadBtn, name: "upload-btn" },
];

trackedElements.forEach(({ el, name }) => {
  el.addEventListener("click", () => logEvent("click", name));
  el.addEventListener("mouseenter", () => logEvent("hover", name));
  el.addEventListener("focus", () => logEvent("focus", name));
});

async function loadConversationHistory() {
  console.log("[history] fetching history for participantID:", participantID);
  try {
    const res = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID }),
    });
    console.log("[history] response status:", res.status);
    const data = await res.json();
    console.log("[history] data received:", data);
    const allHistory = Array.isArray(data) ? data : data.history;
    if (!allHistory || allHistory.length === 0) {
      console.log("[history] no history found for this participant");
      return;
    }
    const recent = allHistory.slice(-HISTORY_LIMIT);
    console.log(`[history] loading last ${recent.length} interaction(s)`);
    recent.forEach(({ userInput, botResponse }) => {
      addMessage(userInput, "user");
      addMessage(botResponse, "bot");
      conversationHistory.push({ role: "user", content: userInput });
      conversationHistory.push({ role: "assistant", content: botResponse });
    });
  } catch (err) {
    console.error("[history] Failed to load chat history:", err);
  }
}

loadConversationHistory();

function addStoryWidgets(interactionId, userWrapper, botWrapper, originalPrompt) {
  const widgetWrapper = document.createElement("div");
  widgetWrapper.className = "story-widgets";

  // Star rating
  const ratingSection = document.createElement("div");
  ratingSection.className = "story-rating";

  const ratingLabel = document.createElement("span");
  ratingLabel.className = "rating-label";
  ratingLabel.textContent = "Rate this story:";
  ratingSection.appendChild(ratingLabel);

  const starsContainer = document.createElement("div");
  starsContainer.className = "stars-container";

  let currentRating = 0;
  let hasRated = false;
  const starButtons = [];

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement("button");
    star.type = "button";
    star.className = "star-btn";
    star.textContent = "☆";
    star.dataset.value = i;

    star.addEventListener("mouseenter", () => {
      if (hasRated) return;
      starButtons.forEach((s, idx) => { s.textContent = idx < i ? "★" : "☆"; });
    });
    star.addEventListener("mouseleave", () => {
      if (hasRated) return;
      starButtons.forEach((s, idx) => { s.textContent = idx < currentRating ? "★" : "☆"; });
    });
    star.addEventListener("click", () => {
      if (hasRated) return;
      currentRating = i;
      hasRated = true;
      starButtons.forEach((s, idx) => { s.textContent = idx < i ? "★" : "☆"; s.disabled = true; });
      ratingLabel.textContent = "Rated:";
      fetch("/rate-story", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId, rating: i }),
      }).catch((err) => console.error("Failed to save rating:", err));
      logEvent("click", "star-rating");
    });

    starButtons.push(star);
    starsContainer.appendChild(star);
  }

  ratingSection.appendChild(starsContainer);
  widgetWrapper.appendChild(ratingSection);

  // Action bar
  const actionBar = document.createElement("div");
  actionBar.className = "story-actions";

  const acceptBtn = document.createElement("button");
  acceptBtn.type = "button";
  acceptBtn.className = "story-action-btn accept-btn";
  acceptBtn.textContent = "Accept";

  const discardBtn = document.createElement("button");
  discardBtn.type = "button";
  discardBtn.className = "story-action-btn discard-btn";
  discardBtn.textContent = "Discard";

  const regenerateBtn = document.createElement("button");
  regenerateBtn.type = "button";
  regenerateBtn.className = "story-action-btn regenerate-btn";
  regenerateBtn.textContent = "Regenerate";

  function disableAllActions() {
    acceptBtn.disabled = true;
    discardBtn.disabled = true;
    regenerateBtn.disabled = true;
  }

  function postAction(action) {
    fetch("/story-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interactionId, action, participantID, systemID }),
    }).catch((err) => console.error("Failed to save story action:", err));
    logEvent("click", "story-action-" + action);
  }

  acceptBtn.addEventListener("click", () => {
    postAction("accept");
    disableAllActions();
    acceptBtn.textContent = "Accepted";
    botWrapper.style.flexDirection = "column";
    botWrapper.style.alignItems = "flex-start";
    const badge = document.createElement("span");
    badge.className = "story-badge accepted-badge";
    badge.textContent = "✓ Accepted";
    botWrapper.appendChild(badge);
  });

  discardBtn.addEventListener("click", () => {
    postAction("discard");
    userWrapper.style.opacity = "0.35";
    botWrapper.style.opacity = "0.35";
    botWrapper.style.flexDirection = "column";
    botWrapper.style.alignItems = "flex-start";
    const badge = document.createElement("span");
    badge.className = "story-badge discarded-badge";
    badge.textContent = "✗ Discarded";
    botWrapper.appendChild(badge);
    widgetWrapper.remove();
    inputField.value = "";
  });

  regenerateBtn.addEventListener("click", () => {
    postAction("regenerate");
    addMessage("Please refine your story description and click Send.", "system");
    inputField.value = originalPrompt;
    inputField.focus();
    disableAllActions();
  });

  actionBar.appendChild(acceptBtn);
  actionBar.appendChild(discardBtn);
  actionBar.appendChild(regenerateBtn);
  widgetWrapper.appendChild(actionBar);

  messagesContainer.appendChild(widgetWrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}
