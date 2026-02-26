const inputField = document.getElementById("user-input");
const sendBtn = document.getElementById("send-button");
const messagesContainer = document.getElementById("chat-box");

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
