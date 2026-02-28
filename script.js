const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const messagesContainer = document.getElementById("messages");
const retrievalSelect = document.getElementById("retrieval-select");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");

function addMessage(text, type = "user") {
  const message = document.createElement("p");
  message.textContent = text;
  message.className = `${type}-message`;
  messagesContainer.appendChild(message);
}

function sendMessage() {
  const userMessage = inputField.value.trim();

  if (!userMessage) {
    alert("Please enter a message before sending.");
    return;
  }

  addMessage(userMessage, "user");
  inputField.value = "";
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


