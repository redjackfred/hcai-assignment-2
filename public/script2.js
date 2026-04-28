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

const _urlParams = new URLSearchParams(window.location.search);
const participantID = _urlParams.get("participantID") || localStorage.getItem("participantID") || "anonymous";
const systemID = _urlParams.get("systemID") || "2";

const HISTORY_LIMIT = 5;
const conversationHistory = [];
let storyRoundCount = 0;

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
      storySettings
    }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      return res.json();
    })
    .then((data) => {
      const botReply = data.response || "No response from bot.";
      const botWrapper = addMessage(botReply, "bot");
      displayEvidence(data.retrievedDocuments, data.confidenceMetrics);
      conversationHistory.push({ role: "user", content: userMessage });
      conversationHistory.push({ role: "assistant", content: botReply });
      if (data.isStory && data.interactionId) {
        addQuizWidget(data.interactionId, botReply, botWrapper, storySettings?.readLevel || 'medium');
      }
    })
    .catch((error) => {
      console.error("Failed to send message to server:", error);
    });
}

loadDocuments();
sendBtn.addEventListener("click", sendMessage);
inputField.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendMessage();
});

retrievalSelect.addEventListener("change", (event) => {
  addMessage(`System: Retrieval method set to ${event.target.value}`, "system");
});

uploadBtn.addEventListener("click", async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) { alert("Choose a file first."); return; }

  const formData = new FormData();
  formData.append("document", file);

  const response = await fetch("/upload-document", { method: "POST", body: formData });
  const data = await response.json();

  if (!response.ok) { alert(`Upload failed: ${data.error || "Unknown error"}`); return; }

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
    const li = document.createElement("li");
    li.textContent = `${doc.filename} - ${doc.processingStatus}`;
    documentsList.appendChild(li);
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
  { el: readLevelSlider, name: "read-level-slider" },
  { el: sentenceLengthSlider, name: "sentence-length-slider" },
  { el: themeCustomInputField, name: "theme-custom-input" },
];
trackedElements.forEach(({ el, name }) => {
  el.addEventListener("click", () => logEvent("click", name));
  el.addEventListener("mouseenter", () => logEvent("hover", name));
  el.addEventListener("focus", () => logEvent("focus", name));
});

themeChipButtons.forEach((button) => {
  button.addEventListener("click", () => {
    logEvent("click", "theme-button");
  });
});

themeCustomInputField.addEventListener("change", () => {
  logEvent("change", "theme-custom-input");
});

function renderQuizQuestions(widget, interactionId, questions, submittedAnswers = null) {
  widget.innerHTML = "";
  const LABELS = ["A", "B", "C", "D"];
  const isSubmitted = submittedAnswers !== null;
  const userAnswers = isSubmitted ? [...submittedAnswers] : new Array(questions.length).fill(null);

  const header = document.createElement("p");
  header.className = "quiz-header";
  header.textContent = "Story Comprehension Quiz";
  widget.appendChild(header);

  questions.forEach((q, qi) => {
    const qDiv = document.createElement("div");
    qDiv.className = "quiz-question";

    const qText = document.createElement("p");
    qText.className = "q-text";
    qText.textContent = `${qi + 1}. ${q.question}`;
    qDiv.appendChild(qText);

    const optDiv = document.createElement("div");
    optDiv.className = "q-options";

    q.options.forEach((opt, oi) => {
      const label = document.createElement("label");
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = `q${qi}-${interactionId}`;
      radio.value = oi;
      radio.disabled = isSubmitted;
      if (isSubmitted) {
        if (oi === submittedAnswers[qi]) radio.checked = true;
        if (oi === q.correctAnswer) label.classList.add("correct");
        else if (oi === submittedAnswers[qi] && submittedAnswers[qi] !== q.correctAnswer) label.classList.add("wrong");
      } else {
        radio.addEventListener("change", () => { userAnswers[qi] = oi; });
      }
      label.appendChild(radio);
      label.appendChild(document.createTextNode(` ${LABELS[oi]}. ${opt}`));
      optDiv.appendChild(label);
    });

    qDiv.appendChild(optDiv);
    widget.appendChild(qDiv);
  });

  if (isSubmitted) {
    const score = questions.filter((q, i) => submittedAnswers[i] === q.correctAnswer).length;
    const scoreEl = document.createElement("p");
    scoreEl.className = "quiz-score";
    scoreEl.textContent = `Score: ${score} / ${questions.length}`;
    widget.appendChild(scoreEl);
  } else {
    const submitBtn = document.createElement("button");
    submitBtn.className = "quiz-submit-btn";
    submitBtn.textContent = "Submit Quiz";
    widget.appendChild(submitBtn);

    submitBtn.addEventListener("click", async () => {
      if (userAnswers.some(a => a === null)) {
        alert("Please answer all questions before submitting.");
        return;
      }
      submitBtn.disabled = true;
      submitBtn.textContent = "Submitting…";
      console.log('[submit] interactionId:', interactionId, '| userAnswers:', userAnswers);
      try {
        const res = await fetch("/submit-quiz", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interactionId, userAnswers }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed");
        renderQuizQuestions(widget, interactionId, questions, userAnswers);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        logEvent("click", "quiz-submit");
      } catch (err) {
        submitBtn.textContent = `Failed: ${err.message}`;
        submitBtn.disabled = false;
        console.error("Quiz submit error:", err);
      }
    });
  }
}

function addQuizWidget(interactionId, storyText, botWrapper, readLevel, skipScroll = false, existingQuiz = null) {
  const widget = document.createElement("div");
  widget.className = "quiz-widget";
  messagesContainer.appendChild(widget);

  if (!skipScroll) {
    const offset = botWrapper.getBoundingClientRect().top - messagesContainer.getBoundingClientRect().top;
    messagesContainer.scrollTop += offset;
  }

  if (existingQuiz) {
    const submittedAnswers = existingQuiz.status === 'submitted'
      ? existingQuiz.questions.map(q => q.userAnswer)
      : null;
    renderQuizQuestions(widget, interactionId, existingQuiz.questions, submittedAnswers);
    return;
  }

  const takeBtn = document.createElement("button");
  takeBtn.className = "quiz-btn";
  takeBtn.textContent = "Take Quiz";
  widget.appendChild(takeBtn);

  takeBtn.addEventListener("click", async () => {
    takeBtn.disabled = true;
    takeBtn.textContent = "Generating quiz…";
    try {
      const res = await fetch("/generate-quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storyText, interactionId, readLevel, participantID, systemID }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      renderQuizQuestions(widget, interactionId, data.questions, null);
      logEvent("click", "quiz-take");
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    } catch (err) {
      takeBtn.textContent = "Failed to load quiz. Try again.";
      takeBtn.disabled = false;
      console.error("Quiz generation error:", err);
    }
  });
}

async function loadConversationHistory() {
  try {
    const res = await fetch("/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID }),
    });
    const data = await res.json();
    const allHistory = Array.isArray(data) ? data : data.history;
    if (!allHistory || allHistory.length === 0) return;
    const recent = allHistory.slice(-HISTORY_LIMIT);
    for (const { _id, userInput, botResponse } of recent) {
      addMessage(userInput, "user");
      const botWrapper = addMessage(botResponse, "bot");
      conversationHistory.push({ role: "user", content: userInput });
      conversationHistory.push({ role: "assistant", content: botResponse });
      const isStory = botResponse.trimStart().startsWith('#');
      if (isStory && _id) {
        const readLevel = window.getStorySettings ? window.getStorySettings().readLevel : 'medium';
        let existingQuiz = null;
        try {
          const qRes = await fetch(`/quiz/${_id}`);
          if (qRes.ok) existingQuiz = await qRes.json();
        } catch (_) {}
        addQuizWidget(_id, botResponse, botWrapper, readLevel, true, existingQuiz);
      }
    }
  } catch (err) {
    console.error("[history] Failed to load chat history:", err);
  }
}

function addStoryWidgets(interactionId, userWrapper, botWrapper, originalPrompt, initialState = {}) {
  const isRestored = Object.keys(initialState).length > 0;
  if (!isRestored) storyRoundCount++;
  const roundAtGeneration = storyRoundCount;
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

  function hideAllActions() {
    actionBar.remove();
  }

  function postAction(action, extraData = {}) {
    fetch("/story-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interactionId, action, participantID, systemID, ...extraData }),
    }).catch((err) => console.error("Failed to save story action:", err));
    logEvent("click", "story-action-" + action);
  }

  acceptBtn.addEventListener("click", () => {
    postAction("accept", { roundsToAccept: roundAtGeneration });
    storyRoundCount = 0;
    hideAllActions();
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
    hideAllActions();
    botWrapper.style.flexDirection = "column";
    botWrapper.style.alignItems = "flex-start";
    const badge = document.createElement("span");
    badge.className = "story-badge regenerate-badge";
    badge.textContent = "↺ Regenerating";
    botWrapper.appendChild(badge);
  });

  actionBar.appendChild(acceptBtn);
  actionBar.appendChild(discardBtn);
  actionBar.appendChild(regenerateBtn);
  widgetWrapper.appendChild(actionBar);

  messagesContainer.appendChild(widgetWrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;

  // Restore persisted state when loading from history
  if (initialState.rating) {
    currentRating = initialState.rating;
    hasRated = true;
    starButtons.forEach((s, idx) => { s.textContent = idx < initialState.rating ? "★" : "☆"; s.disabled = true; });
    ratingLabel.textContent = "Rated:";
  }
  if (initialState.action === "accept") {
    hideAllActions();
    botWrapper.style.flexDirection = "column";
    botWrapper.style.alignItems = "flex-start";
    const badge = document.createElement("span");
    badge.className = "story-badge accepted-badge";
    badge.textContent = "✓ Accepted";
    botWrapper.appendChild(badge);
  } else if (initialState.action === "discard") {
    userWrapper.style.opacity = "0.35";
    botWrapper.style.opacity = "0.35";
    botWrapper.style.flexDirection = "column";
    botWrapper.style.alignItems = "flex-start";
    const badge = document.createElement("span");
    badge.className = "story-badge discarded-badge";
    badge.textContent = "✗ Discarded";
    botWrapper.appendChild(badge);
    widgetWrapper.remove();
  } else if (initialState.action === "regenerate") {
    hideAllActions();
    botWrapper.style.flexDirection = "column";
    botWrapper.style.alignItems = "flex-start";
    const badge = document.createElement("span");
    badge.className = "story-badge regenerate-badge";
    badge.textContent = "↺ Regenerating";
    botWrapper.appendChild(badge);
  }
}

loadConversationHistory();
