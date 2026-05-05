const workflowParams = new URLSearchParams(window.location.search);
const workflowParticipantID = workflowParams.get("participantID") || localStorage.getItem("participantID") || "";
const workflowSystemID = workflowParams.get("systemID") || localStorage.getItem("systemID") || "1";

localStorage.setItem("participantID", workflowParticipantID);
localStorage.setItem("systemID", workflowSystemID);

const participantIdDisplay = document.getElementById("participant-id-display");
const systemIdDisplay = document.getElementById("system-id-display");
const surveyBtn = document.getElementById("survey-btn");
const taskBtn = document.getElementById("task-btn");
const preTaskBtn = document.getElementById("pre-task-btn");
const prototypeBtn = document.getElementById("prototype-btn");
const postTaskBtn = document.getElementById("post-task-btn");

if (participantIdDisplay) {
  participantIdDisplay.textContent = workflowParticipantID || "unknown";
}

if (systemIdDisplay) {
  systemIdDisplay.textContent = workflowSystemID === "2" ? "System 2" : "System 1";
}

function logWorkflowEvent(elementName) {
  if (!workflowParticipantID) {
    return Promise.resolve();
  }

  return fetch("/log-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      participantID: workflowParticipantID,
      systemID: workflowSystemID,
      eventType: "click",
      elementName,
    }),
  }).catch((error) => {
    console.error("Failed to log workflow event:", error);
  });
}

async function redirectToQualtrics() {
  try {
    const response = await fetch("/redirect-to-survey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participantID: workflowParticipantID }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    const url = await response.text();
    await logWorkflowEvent("survey-btn");
    window.location.href = url;
  } catch (error) {
    console.error("Error redirecting to survey:", error);
    alert("There was an error redirecting to the survey. Please try again.");
  }
}

function goToAssignedSystem() {
  const route = workflowSystemID === "2" ? "/chat2" : "/chat";
  logWorkflowEvent("prototype-btn").finally(() => {
    window.location.href = `${route}?participantID=${encodeURIComponent(workflowParticipantID)}&systemID=${encodeURIComponent(workflowSystemID)}`;
  });
}

function goToTaskInstructions() {
  logWorkflowEvent("task-btn").finally(() => {
    window.location.href = `/task.html?participantID=${encodeURIComponent(workflowParticipantID)}&systemID=${encodeURIComponent(workflowSystemID)}`;
  });
}

surveyBtn?.addEventListener("click", redirectToQualtrics);
taskBtn?.addEventListener("click", goToTaskInstructions);
preTaskBtn?.addEventListener("click", () => {
  const preTaskURL = "https://usfca.qualtrics.com/jfe/form/SV_eG2Cf95z9O2E2BU";
  logWorkflowEvent("pre-task-btn").finally(() => {
    window.location.href = `${preTaskURL}?participantID=${encodeURIComponent(workflowParticipantID)}&systemID=${encodeURIComponent(workflowSystemID)}`;
  });
});
prototypeBtn?.addEventListener("click", goToAssignedSystem);
postTaskBtn?.addEventListener("click", () => {
  const postTaskURL = "https://usfca.qualtrics.com/jfe/form/SV_6AssvmwOaWYXL2S";
  logWorkflowEvent("post-task-btn").finally(() => {
    window.location.href = `${postTaskURL}?participantID=${encodeURIComponent(workflowParticipantID)}&systemID=${encodeURIComponent(workflowSystemID)}`;
  });
});
