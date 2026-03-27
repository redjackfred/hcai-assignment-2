const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalSelect = document.getElementById("retrieval-select");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// Participant ID
const participantID = localStorage.getItem("participantID") ?? "anonymous";

function addMessage(text, type = "user") {
  const message = document.createElement("p");
  message.textContent = text;
  message.className = `${type}-message`;
  messagesContainer.appendChild(message);
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

  fetch("/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: userMessage, retrievalMethod, participantID }),
  })
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Request failed with status ${res.status}`);
      }
      return res.json();
    })
    .then((data) => {
      const botReply = data.response || "No response from bot.";
      addMessage(`Bot: ${botReply}`, "bot");
      displayEvidence(data.retrievedDocuments, data.confidenceMetrics);
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
    body: JSON.stringify({ participantID, eventType, elementName }),
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

// Load chat history on page load 
console.log("[history] fetching history for participantID:", participantID);
fetch("/history", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ participantID }),
})
  .then((res) => {
    console.log("[history] response status:", res.status);
    return res.json();
  })
  .then((data) => {
    console.log("[history] data received:", data);
    const history = Array.isArray(data) ? data : data.history;
    if (!history || history.length === 0) {
      console.log("[history] no history found for this participant");
      return;
    }
    console.log(`[history] loading ${history.length} message(s)`);
    history.forEach(({ userInput, botResponse }) => {
      addMessage(userInput, "user");
      addMessage(`Bot: ${botResponse}`, "bot");
    });
  })
  .catch((err) => console.error("[history] Failed to load chat history:", err));
