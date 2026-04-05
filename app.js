// ===========================
//  Scene Trap — app.js
// ===========================

// --- Dropdown Data ---

const SCENARIO_OPTIONS = {
  world: [
    "A crumbling Victorian mansion",
    "A neon-lit cyberpunk city",
    "An ancient forest shrine",
    "A cultivation sect in a fractured world",
    "A mythic court of gods judging mortals",
    "A floating city above a drowned world",
    "A remote Antarctic research base",
    "A modern hospital during a critical night",
  ],
  relationship: [
    "Estranged siblings",
    "Former lovers",
    "Rivals who need each other",
    "A mentor and a betrayer",
    "Strangers with a shared secret",
    "A captor and their captive",
    "Colleagues who no longer trust each other",
    "An heir and a loyal servant",
  ],
  scene: [
    "A final confrontation",
    "A desperate negotiation",
    "An unexpected reunion",
    "A moment of confession",
    "A chase with no escape",
    "A deal with dangerous terms",
    "An ambush disguised as a welcome",
    "A farewell neither wanted",
  ],
};

// --- DOM References ---

const selectWorld        = document.getElementById("select-world");
const selectRelationship = document.getElementById("select-relationship");
const selectScene        = document.getElementById("select-scene");

const btnGenerate  = document.getElementById("btn-generate");
const btnRead      = document.getElementById("btn-read");
const btnChaos     = document.getElementById("btn-chaos");
const btnAddLine   = document.getElementById("btn-add-line");

const sceneCard    = document.getElementById("scene-card");
const sceneMeta    = document.getElementById("scene-meta");
const sceneBody    = document.getElementById("scene-body");
const sceneGoalBlock      = document.getElementById("scene-goal-block");
const sceneGoalText       = document.getElementById("scene-goal-text");
const sceneConstraintBlock = document.getElementById("scene-constraint-block");
const sceneConstraintText  = document.getElementById("scene-constraint-text");

const chaosDisplay = document.getElementById("chaos-display");
const chaosText    = document.getElementById("chaos-text");
const chaosSound   = new Audio("chaos.mp3");

const dialogueLog   = document.getElementById("dialogue-log");
const dialogueInput = document.getElementById("dialogue-input");

const statusMessage = document.getElementById("status-message");

const speakerIndicator   = document.getElementById("speaker-indicator");
const btnMic             = document.getElementById("btn-mic");
const btnClaim           = document.getElementById("btn-claim");
const btnReport          = document.getElementById("btn-report");
const reportModal        = document.getElementById("report-modal");
const reportStep1        = document.getElementById("report-step-1");
const reportStep2        = document.getElementById("report-step-2");
const reportRetractPreview = document.getElementById("report-retract-preview");
const btnReportCancel    = document.getElementById("btn-report-cancel");
const btnReportConstraint = document.getElementById("btn-report-constraint");
const btnReportGoal      = document.getElementById("btn-report-goal");
const btnReportOther     = document.getElementById("btn-report-other");
const btnRetractConfirm  = document.getElementById("btn-retract-confirm");
const btnRetractCancel   = document.getElementById("btn-retract-cancel");
const completionModal    = document.getElementById("completion-modal");
const btnModalAccept     = document.getElementById("btn-modal-accept");
const btnModalReject     = document.getElementById("btn-modal-reject");
const sceneCompleteBanner = document.getElementById("scene-complete-banner");
const btnHelp            = document.getElementById("btn-help");
const helpPanel          = document.getElementById("help-panel");

// --- State ---

let currentScene = "";
let currentSharedGoal = "";
let currentSpeakingConstraint = "";
let currentSelections = null;
let dialogueLines = []; // each entry: { speaker: "A" | "B", text: string }
let claimedBy = new Set(); // tracks which players ("A", "B") have confirmed completion

// --- Init ---

function init() {
  populateDropdowns();
  attachEventListeners();
  updateSpeakerIndicator();
}

function populateDropdowns() {
  const pairs = [
    [selectWorld,        SCENARIO_OPTIONS.world],
    [selectRelationship, SCENARIO_OPTIONS.relationship],
    [selectScene,        SCENARIO_OPTIONS.scene],
  ];

  for (const [select, options] of pairs) {
    for (const option of options) {
      const el = document.createElement("option");
      el.textContent = option;
      el.value = option;
      select.appendChild(el);
    }
  }
}

function attachEventListeners() {
  btnGenerate.addEventListener("click", handleGenerateScene);
  btnRead.addEventListener("click", handleReadScene);
  btnChaos.addEventListener("click", handleTriggerChaos);
  btnAddLine.addEventListener("click", handleAddLine);
  dialogueInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") handleAddLine();
  });
  document.querySelectorAll('input[name="speaker"]').forEach((radio) => {
    radio.addEventListener("change", updateSpeakerIndicator);
  });
  btnClaim.addEventListener("click", handleClaimCompletion);
  btnReport.addEventListener("click", handleReportViolation);
  btnReportCancel.addEventListener("click", closeReportModal);
  btnReportConstraint.addEventListener("click", () => showRetractStep("Speaking constraint broken"));
  btnReportGoal.addEventListener("click", () => showRetractStep("Shared goal triggered"));
  btnReportOther.addEventListener("click", () => showRetractStep("Other"));
  btnRetractConfirm.addEventListener("click", confirmRetract);
  btnRetractCancel.addEventListener("click", closeReportModal);
  btnHelp.addEventListener("click", toggleHelp);
  initMicButton();
  btnModalAccept.addEventListener("click", handleAcceptCompletion);
  btnModalReject.addEventListener("click", handleRejectCompletion);
}

// --- Helpers ---

function getSelections() {
  return {
    world:        selectWorld.value,
    relationship: selectRelationship.value,
    scene:        selectScene.value,
  };
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.classList.remove("hidden", "is-error");
  if (isError) statusMessage.classList.add("is-error");
}

function clearStatus() {
  statusMessage.classList.add("hidden");
  statusMessage.textContent = "";
}

function showSceneCard() {
  sceneCard.classList.remove("hidden");
}

function renderSceneMeta(selections) {
  sceneMeta.innerHTML = "";
  for (const value of Object.values(selections)) {
    const pill = document.createElement("span");
    pill.className = "scene-pill";
    pill.textContent = value;
    sceneMeta.appendChild(pill);
  }
}

// Types text into an element one character at a time.
// speed: milliseconds per character (default 20).
// onComplete: optional callback when done.
function typewriteText(element, text, speed, onComplete) {
  const msPerChar = speed || 20;
  element.textContent = "";
  let i = 0;
  const interval = setInterval(() => {
    element.textContent += text[i];
    i++;
    if (i >= text.length) {
      clearInterval(interval);
      if (onComplete) onComplete();
    }
  }, msPerChar);
}

// Appends a single new dialogue line with a typewriter effect.
// Used when a player submits a line — only animates the new entry.
function appendDialogueLine(entry) {
  const placeholder = dialogueLog.querySelector(".dialogue-placeholder");
  if (placeholder) placeholder.remove();

  const block = document.createElement("div");
  block.className = `dialogue-line dialogue-line--${entry.speaker.toLowerCase()}`;

  const speaker = document.createElement("span");
  speaker.className = "dialogue-speaker";
  speaker.textContent = `Player ${entry.speaker}`;

  const textEl = document.createElement("p");
  textEl.className = "dialogue-text";

  block.appendChild(speaker);
  block.appendChild(textEl);
  dialogueLog.appendChild(block);
  dialogueLog.scrollTop = dialogueLog.scrollHeight;

  typewriteText(textEl, entry.text, 20, () => {
    dialogueLog.scrollTop = dialogueLog.scrollHeight;
  });
}

function getCurrentSpeaker() {
  const checked = document.querySelector('input[name="speaker"]:checked');
  return checked ? checked.value : "A";
}

function updateSpeakerIndicator() {
  const speaker = getCurrentSpeaker();
  speakerIndicator.textContent = `— Player ${speaker} —`;
  speakerIndicator.dataset.speaker = speaker;
}

function renderDialogueLog() {
  if (dialogueLines.length === 0) {
    dialogueLog.innerHTML = '<p class="dialogue-placeholder">No lines yet. Start the scene!</p>';
    return;
  }
  dialogueLog.innerHTML = "";
  for (const entry of dialogueLines) {
    const block = document.createElement("div");
    block.className = `dialogue-line dialogue-line--${entry.speaker.toLowerCase()}`;

    const speaker = document.createElement("span");
    speaker.className = "dialogue-speaker";
    speaker.textContent = `Player ${entry.speaker}`;

    const text = document.createElement("p");
    text.className = "dialogue-text";
    text.textContent = entry.text;

    block.appendChild(speaker);
    block.appendChild(text);
    dialogueLog.appendChild(block);
  }
  dialogueLog.scrollTop = dialogueLog.scrollHeight;
}

// --- Handlers ---

async function handleGenerateScene() {
  const selections = getSelections();
  clearStatus();
  renderSceneMeta(selections);
  showSceneCard();

  // Reset scene layers and completion UI from any previous generation
  sceneGoalBlock.classList.add("hidden");
  sceneConstraintBlock.classList.add("hidden");
  claimedBy = new Set();
  sceneCompleteBanner.classList.add("hidden");
  dialogueInput.disabled = false;
  btnAddLine.disabled = false;
  btnClaim.disabled = false;

  // Show a loading state while the API call is in flight
  sceneBody.textContent = "Setting the scene…";
  sceneBody.classList.add("is-loading");
  btnGenerate.disabled = true;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selections),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || response.statusText);
    }
    const data = await response.json();
    currentScene = data.sceneText;
    currentSharedGoal = data.sharedGoal;
    currentSpeakingConstraint = data.constraint;
    currentSelections = selections;

    sceneBody.classList.remove("is-loading");
    typewriteText(sceneBody, currentScene, 12);

    // Show shared goal
    sceneGoalBlock.classList.remove("hidden");
    typewriteText(sceneGoalText, data.sharedGoal, 15);

    // Show AI-generated expression constraint
    sceneConstraintBlock.classList.remove("hidden");
    typewriteText(sceneConstraintText, data.constraint, 15);

  } catch (error) {
    sceneBody.classList.remove("is-loading");
    sceneBody.textContent = "";
    showStatus(`Could not generate scene: ${error.message}`, true);
  } finally {
    btnGenerate.disabled = false;
  }

  dialogueLines = [];
  renderDialogueLog();
}

function handleReadScene() {
  // TODO (Stage 4): use SpeechSynthesis API here.
  showStatus("Read Scene not yet implemented.");
}

async function handleTriggerChaos() {
  btnChaos.disabled = true;

  try {
    const response = await fetch("/api/chaos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sceneText: currentScene,
        sharedGoal: currentSharedGoal,
        constraint: currentSpeakingConstraint,
        world: currentSelections?.world,
        relationship: currentSelections?.relationship,
        scene: currentSelections?.scene,
      }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || response.statusText);
    }
    const data = await response.json();
    await showChaosEvent(data.text);

  } catch (error) {
    showStatus(`Could not generate chaos event: ${error.message}`, true);
  } finally {
    btnChaos.disabled = false;
  }
}

// Tries to deliver the chaos event as a browser notification.
// Falls back to the in-page display if permission is denied or unavailable.
async function showChaosEvent(text) {
  chaosText.textContent = text;

  if (!("Notification" in window)) {
    showChaosInPage();
    return;
  }

  if (Notification.permission === "granted") {
    new Notification("Chaos Event", { body: text });
    showChaosInPage(); // also show in-page so players don't miss it
    return;
  }

  if (Notification.permission === "denied") {
    showChaosInPage();
    return;
  }

  // permission is "default" — ask the user
  const permission = await Notification.requestPermission();
  if (permission === "granted") {
    new Notification("Chaos Event", { body: text });
  }
  showChaosInPage(); // always show in-page regardless
}

function showChaosInPage() {
  chaosDisplay.classList.remove("hidden");
  chaosDisplay.scrollIntoView({ behavior: "smooth", block: "nearest" });
  chaosSound.currentTime = 0;
  chaosSound.volume = 0.6;
  chaosSound.play().catch(() => {});
}

function speakLine(text) {
  if (!window.speechSynthesis) return;

  const utterance = new SpeechSynthesisUtterance(text);

  const voices = speechSynthesis.getVoices();

  const preferredVoice = voices.find(v =>
    v.name.includes("Google") ||
    v.name.includes("Samantha") ||
    v.name.includes("Microsoft")
  );

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.rate = 1.1;   
  utterance.pitch = 1;     
  utterance.volume = 1;

  speechSynthesis.speak(utterance);
}

function handleAddLine() {
  const text = dialogueInput.value.trim();
  if (!text) return;
  const entry = { speaker: getCurrentSpeaker(), text };
  dialogueLines.push(entry);
  dialogueInput.value = "";
  appendDialogueLine(entry);
  speakLine(text);
}

// --- Voice Input ---

function initMicButton() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    btnMic.disabled = true;
    btnMic.title = "Voice input not supported in this browser";
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener("result", (event) => {
    dialogueInput.value = event.results[0][0].transcript;
    dialogueInput.focus();
  });

  recognition.addEventListener("end", () => {
    btnMic.classList.remove("is-listening");
  });

  recognition.addEventListener("error", (event) => {
    btnMic.classList.remove("is-listening");
    if (event.error === "not-allowed") {
      showStatus("Microphone permission denied. Enable it in browser settings.", true);
    }
  });

  btnMic.addEventListener("click", () => {
    btnMic.classList.add("is-listening");
    recognition.start();
  });
}

// --- Completion Flow ---

function handleClaimCompletion() {
  const speaker = getCurrentSpeaker();
  if (claimedBy.has(speaker)) {
    showStatus("You have already claimed completion. Waiting for the other player.");
    return;
  }
  completionModal.classList.remove("hidden");
  btnModalAccept.focus();
}

function handleAcceptCompletion() {
  completionModal.classList.add("hidden");
  claimedBy.add(getCurrentSpeaker());

  if (claimedBy.size >= 2) {
    // Both players confirmed — scene is over
    sceneCompleteBanner.classList.remove("hidden");
    sceneCompleteBanner.querySelector(".complete-eyebrow").textContent = "SCENE CONCLUDED";
    sceneCompleteBanner.querySelector(".complete-message").textContent =
      "Both players have agreed. The scene is complete.";
    dialogueInput.disabled = true;
    btnAddLine.disabled = true;
    btnClaim.disabled = true;
  } else {
    // First player confirmed — waiting for the second
    sceneCompleteBanner.classList.remove("hidden");
    sceneCompleteBanner.querySelector(".complete-eyebrow").textContent = "WAITING";
    sceneCompleteBanner.querySelector(".complete-message").textContent =
      "Waiting for the other player to confirm…";
  }
}

function handleRejectCompletion() {
  completionModal.classList.add("hidden");
  btnClaim.focus();
}

// --- Report Flow ---

function handleReportViolation() {
  reportStep1.classList.remove("hidden");
  reportStep2.classList.add("hidden");
  reportModal.classList.remove("hidden");
}

function showRetractStep(type) {
  const last = dialogueLines[dialogueLines.length - 1];
  if (!last) {
    closeReportModal();
    showStatus(`Report noted: ${type}. No lines to retract.`);
    return;
  }
  reportRetractPreview.textContent = `Player ${last.speaker}: "${last.text}"`;
  reportStep1.classList.add("hidden");
  reportStep2.classList.remove("hidden");
}

function confirmRetract() {
  closeReportModal();
  if (dialogueLines.length === 0) return;
  dialogueLines.pop();
  renderDialogueLog();
  showStatus("Last line retracted.");
}

function closeReportModal() {
  reportModal.classList.add("hidden");
  reportStep1.classList.remove("hidden");
  reportStep2.classList.add("hidden");
}

// --- Help Panel ---

function toggleHelp() {
  const isHidden = helpPanel.classList.toggle("hidden");
  btnHelp.setAttribute("aria-expanded", String(!isHidden));
}

// --- Start ---

document.addEventListener("DOMContentLoaded", init);
