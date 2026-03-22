const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalSelect = document.getElementById("retrieval-select");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

// Participant ID 
const TEST_PARTICIPANT_ID = "peter-test-001";

const participantID =
  TEST_PARTICIPANT_ID ?? localStorage.getItem("participantID") ?? "anonymous";

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
    })
    .catch((error) => {
      console.error("Failed to send message to server:", error);
    });
}

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

uploadBtn.addEventListener("click", (event) => {
  event.preventDefault();
  const selectedFile = fileInput.files?.[0];
  const fileName = selectedFile ? selectedFile.name : "No file selected";
  console.log(`Selected file: ${fileName}`);
});

// Event logging 
function logEvent(eventType, elementName) {
  fetch("/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ participantID, eventType, elementName }),
  }).catch((err) => console.error("Failed to log event:", err));
}

const trackedElements = [
  { el: sendBtn,       name: "send-btn" },
  { el: inputField,    name: "user-input" },
  { el: retrievalSelect, name: "retrieval-select" },
  { el: uploadBtn,     name: "upload-btn" },
];

trackedElements.forEach(({ el, name }) => {
  el.addEventListener("click",      () => logEvent("click",  name));
  el.addEventListener("mouseenter", () => logEvent("hover",  name));
  el.addEventListener("focus",      () => logEvent("focus",  name));
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
