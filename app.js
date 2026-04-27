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
const chaosList    = document.getElementById("chaos-list");
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
const roomEndedModal     = document.getElementById("room-ended-modal");
const completionModal    = document.getElementById("completion-modal");
const btnModalAccept     = document.getElementById("btn-modal-accept");
const btnModalReject     = document.getElementById("btn-modal-reject");
const sceneCompleteBanner = document.getElementById("scene-complete-banner");
const btnHelp            = document.getElementById("btn-help");
const helpPanel          = document.getElementById("help-panel");

// Lobby / Room
const lobbyPanel       = document.getElementById("lobby-panel");
const inputPlayerName  = document.getElementById("input-player-name");
const btnCreateRoom    = document.getElementById("btn-create-room");
const inputRoomCode    = document.getElementById("input-room-code");
const btnJoinRoom      = document.getElementById("btn-join-room");
const btnPlayLocal     = document.getElementById("btn-play-local");
const roomInfoBar      = document.getElementById("room-info-bar");
const roomInfoCode     = document.getElementById("room-info-code");
const roomInfoRole     = document.getElementById("room-info-role");
const roomInfoName     = document.getElementById("room-info-name");
const btnLeaveRoom     = document.getElementById("btn-leave-room");
const setupPanel       = document.getElementById("setup-panel");
const dialoguePanel    = document.getElementById("dialogue-panel");
const speakerToggle    = document.querySelector(".speaker-toggle");

// --- State ---

let currentScene = "";
let currentSharedGoal = "";
let currentSpeakingConstraint = "";
let currentSelections = null;
let dialogueLines = []; // each entry: { speaker: "A" | "B", text: string }
let localChaosEvents = []; // local-mode chaos chain: array of text strings
let claimedBy = new Set(); // tracks which players ("A", "B") have confirmed completion

// --- Room State ---

let roomState = {
  playerId: null,
  playerName: null,
  roomId: null,
  playerRole: null, // "A" or "B", null when playing locally
};

let pollInterval = null;
let lastKnownRoomStatus = null;
let lastKnownSceneText = "";
let lastKnownDialogueLength = 0;
let lastSeenChaosId = null;

// --- Init ---

function init() {
  populateDropdowns();
  attachEventListeners();

  // Check for existing room session in localStorage
  const session = loadSession();
  if (session && session.roomId) {
    roomState = session;
    enterGameMode(true);
  } else {
    enterLobbyMode();
  }
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
  document.getElementById("btn-return-to-menu").addEventListener("click", resetAndReturnToLobby);

  // Lobby
  btnCreateRoom.addEventListener("click", handleCreateRoom);
  btnJoinRoom.addEventListener("click", handleJoinRoom);
  btnPlayLocal.addEventListener("click", handlePlayLocal);
  btnLeaveRoom.addEventListener("click", handleLeaveRoom);
  inputRoomCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleJoinRoom();
  });
  inputPlayerName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCreateRoom();
  });
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
  if (roomState.playerRole) return roomState.playerRole;
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
  if (!roomState.roomId) {
    dialogueInput.disabled = false;
    btnAddLine.disabled = false;
  }
  btnClaim.disabled = false;

  // Show a loading state while the API call is in flight
  sceneBody.textContent = "Setting the scene…";
  sceneBody.classList.add("is-loading");
  btnGenerate.disabled = true;

  // In room mode, send credentials so the backend can save the result
  const body = roomState.roomId
    ? { ...selections, roomId: roomState.roomId, playerId: roomState.playerId }
    : selections;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
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

    // Prevent the next poll from re-rendering this scene for the host
    if (roomState.roomId) lastKnownSceneText = data.sceneText;

    sceneBody.classList.remove("is-loading");
    typewriteText(sceneBody, currentScene, 12);

    sceneGoalBlock.classList.remove("hidden");
    typewriteText(sceneGoalText, data.sharedGoal, 15);

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
  // Button is hidden in UI — SpeechSynthesis is used via speakLine() on each dialogue line instead.
}

async function handleTriggerChaos() {
  btnChaos.disabled = true;

  try {
    const body = roomState.roomId
      ? { roomId: roomState.roomId, playerId: roomState.playerId }
      : {
          sceneText: currentScene,
          constraint: currentSpeakingConstraint,
        };

    const response = await fetch("/api/chaos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      // Pacing / eligibility errors are friendly messages, not crashes
      showStatus(data.error || response.statusText, true);
      return;
    }

    if (roomState.roomId && data.room) {
      // Mark the new event as seen so polling doesn't re-play the sound for us
      const events = data.room.chaosEvents;
      if (events && events.length > 0) {
        lastSeenChaosId = events[events.length - 1].id;
      }
      renderChaosFromRoom(data.room.chaosEvents, true);
    } else {
      localChaosEvents.push(data.text);
      renderLocalChaos(true);
    }

  } catch (error) {
    showStatus(`Could not generate chaos event: ${error.message}`, true);
  } finally {
    btnChaos.disabled = false;
  }
}

// Render the full chaos list from room.chaosEvents; play sound if playSound is true.
function renderChaosFromRoom(events, playSound) {
  if (!events || events.length === 0) return;
  chaosList.innerHTML = "";
  events.forEach((ev, i) => {
    chaosList.appendChild(buildChaosEntry(i + 1, ev.text));
  });
  revealChaosDisplay(playSound);
  notifyChaos(events[events.length - 1].text);
}

// Render the local chaos list.
function renderLocalChaos(playSound) {
  if (localChaosEvents.length === 0) return;
  chaosList.innerHTML = "";
  localChaosEvents.forEach((text, i) => {
    chaosList.appendChild(buildChaosEntry(i + 1, text));
  });
  revealChaosDisplay(playSound);
  notifyChaos(localChaosEvents[localChaosEvents.length - 1]);
}

function buildChaosEntry(index, text) {
  const li = document.createElement("li");
  li.className = "chaos-entry";
  const label = document.createElement("span");
  label.className = "chaos-entry-label";
  label.textContent = `Chaos ${index}`;
  const body = document.createElement("span");
  body.className = "chaos-entry-text";
  body.textContent = text;
  li.appendChild(label);
  li.appendChild(body);
  return li;
}

function revealChaosDisplay(playSound) {
  chaosDisplay.classList.remove("hidden");
  chaosDisplay.scrollIntoView({ behavior: "smooth", block: "nearest" });
  if (playSound) {
    chaosSound.currentTime = 0;
    chaosSound.volume = 0.6;
    chaosSound.play().catch(() => {});
  }
}

async function notifyChaos(text) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    new Notification("Chaos Event", { body: text });
  } else if (Notification.permission === "default") {
    const permission = await Notification.requestPermission();
    if (permission === "granted") new Notification("Chaos Event", { body: text });
  }
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

async function handleAddLine() {
  const text = dialogueInput.value.trim();
  if (!text) return;

  if (roomState.roomId) {
    // --- Room mode: validate turn on server, persist line ---
    btnAddLine.disabled = true;
    dialogueInput.disabled = true;

    try {
      const res = await fetch("/api/send-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: roomState.roomId, playerId: roomState.playerId, text }),
      });

      if (!res.ok) {
        const err = await res.json();
        showStatus(err.error || "Could not send line.", true);
        // Re-enable if it's still this player's turn (e.g. non-fatal error)
        updateTurnControls(roomState.currentTurnCache ?? roomState.playerRole);
        return;
      }

      const data = await res.json();
      dialogueInput.value = "";
      speakLine(text);

      // Sync immediately from response rather than waiting for next poll
      syncDialogueFromRoom(data.room);
      updateTurnControls(data.room.currentTurn);

    } catch (e) {
      showStatus("Could not send line.", true);
    }

  } else {
    // --- Local mode: append directly ---
    const entry = { speaker: getCurrentSpeaker(), text };
    dialogueLines.push(entry);
    dialogueInput.value = "";
    appendDialogueLine(entry);
    speakLine(text);
  }
}

// Rebuilds the local dialogue log from the server's room.dialogueLines array.
// Called after a successful send or when polling detects new lines.
function syncDialogueFromRoom(room) {
  if (!room.dialogueLines) return;
  lastKnownDialogueLength = room.dialogueLines.length;
  // Map server format → local format that renderDialogueLog understands
  dialogueLines = room.dialogueLines.map((l) => ({ speaker: l.playerRole, text: l.text }));
  renderDialogueLog();
}

// Enables/disables the speak controls and updates the turn indicator.
function updateTurnControls(currentTurn) {
  // Cache for error-recovery in handleAddLine
  if (roomState) roomState.currentTurnCache = currentTurn;

  const isMyTurn = currentTurn === roomState.playerRole;
  dialogueInput.disabled = !isMyTurn;
  btnAddLine.disabled = !isMyTurn;

  if (isMyTurn) {
    speakerIndicator.textContent = "— Your turn —";
    speakerIndicator.dataset.speaker = roomState.playerRole;
  } else {
    speakerIndicator.textContent = "— Waiting for Player " + currentTurn + " —";
    speakerIndicator.dataset.speaker = currentTurn;
  }
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

// --- Local Storage ---

function loadSession() {
  try {
    const saved = localStorage.getItem("scenetrap_session");
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore corrupt data */ }
  return null;
}

function saveSession() {
  localStorage.setItem("scenetrap_session", JSON.stringify(roomState));
}

function clearSession() {
  localStorage.removeItem("scenetrap_session");
  roomState = { playerId: null, playerName: null, roomId: null, playerRole: null };
}

function getOrCreatePlayerId() {
  let id = localStorage.getItem("scenetrap_playerId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("scenetrap_playerId", id);
  }
  return id;
}

// --- Mode Switching ---

function enterLobbyMode() {
  stopPolling();
  lobbyPanel.classList.remove("hidden");
  roomInfoBar.classList.add("hidden");
  setupPanel.classList.add("hidden");
  dialoguePanel.classList.add("hidden");
  speakerToggle.classList.remove("hidden");
  clearStatus();
}

function enterGameMode(isRoom) {
  lobbyPanel.classList.add("hidden");
  setupPanel.classList.remove("hidden");
  dialoguePanel.classList.remove("hidden");

  if (isRoom) {
    roomInfoBar.classList.remove("hidden");
    roomInfoCode.textContent = roomState.roomId;
    roomInfoRole.textContent = "Player " + roomState.playerRole;
    roomInfoName.textContent = roomState.playerName;
    btnLeaveRoom.textContent = "Leave Room";
    btnLeaveRoom.disabled = false;

    // Host can generate; Player B waits for host
    if (roomState.playerRole === "B") {
      btnGenerate.disabled = true;
      btnGenerate.textContent = "Waiting for host to start the scene…";
    } else {
      btnGenerate.disabled = false;
      btnGenerate.textContent = "Enter the Scene";
    }

    lastKnownSceneText = "";
    lastKnownDialogueLength = 0;

    // Dialogue controls are locked until the scene starts and it's the player's turn
    dialogueInput.disabled = true;
    btnAddLine.disabled = true;

    // Lock speaker to assigned role — hide the manual A/B toggle
    const radio = document.querySelector('input[name="speaker"][value="' + roomState.playerRole + '"]');
    if (radio) radio.checked = true;
    speakerToggle.classList.add("hidden");

    showStatus("Connecting to room...");
    lastKnownRoomStatus = null;
    startPolling();
  } else {
    roomInfoBar.classList.add("hidden");
    speakerToggle.classList.remove("hidden");
    stopPolling();
  }

  updateSpeakerIndicator();
}

// --- Lobby Handlers ---

async function handleCreateRoom() {
  const name = inputPlayerName.value.trim();
  if (!name) {
    showStatus("Please enter a display name.", true);
    return;
  }

  btnCreateRoom.disabled = true;
  clearStatus();

  try {
    const playerId = getOrCreatePlayerId();
    const res = await fetch("/api/create-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId, playerName: name }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to create room");
    }

    const data = await res.json();

    roomState = {
      playerId,
      playerName: name,
      roomId: data.roomId,
      playerRole: data.playerRole,
    };
    saveSession();
    enterGameMode(true);
  } catch (error) {
    showStatus("Could not create room: " + error.message, true);
  } finally {
    btnCreateRoom.disabled = false;
  }
}

async function handleJoinRoom() {
  const name = inputPlayerName.value.trim();
  if (!name) {
    showStatus("Please enter a display name.", true);
    return;
  }

  const code = inputRoomCode.value.trim().toUpperCase();
  if (!code || code.length < 4) {
    showStatus("Please enter a valid 4-character room code.", true);
    return;
  }

  btnJoinRoom.disabled = true;
  clearStatus();

  try {
    const playerId = getOrCreatePlayerId();
    const res = await fetch("/api/join-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: code, playerId, playerName: name }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to join room");
    }

    const data = await res.json();

    roomState = {
      playerId,
      playerName: name,
      roomId: data.roomId,
      playerRole: data.playerRole,
    };
    saveSession();
    enterGameMode(true);
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    btnJoinRoom.disabled = false;
  }
}

function handlePlayLocal() {
  clearSession();
  enterGameMode(false);
}

async function handleLeaveRoom() {
  btnLeaveRoom.disabled = true;
  btnLeaveRoom.textContent = "Leaving…";

  const { roomId, playerId } = roomState;
  const needsApiCall = roomId && playerId && lastKnownRoomStatus !== "waiting";

  if (needsApiCall) {
    // Only notify the server when a second player is present — single-player
    // waiting rooms have nobody to notify and the key expires automatically.
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 4000);
    try {
      await fetch("/api/end-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, playerId }),
        signal: abort.signal,
      });
    } catch (e) {
      // timeout or network error — proceed regardless
    } finally {
      clearTimeout(timeout);
    }
  }

  resetAndReturnToLobby();
}

function resetAndReturnToLobby() {
  roomEndedModal.classList.add("hidden");

  // Re-enable and restore controls that may have been locked for room mode
  dialogueInput.disabled = false;
  btnAddLine.disabled = false;
  btnClaim.disabled = false;
  btnChaos.disabled = false;
  btnGenerate.disabled = false;
  btnGenerate.textContent = "Enter the Scene";
  btnLeaveRoom.disabled = false;

  lastKnownSceneText = "";
  lastKnownDialogueLength = 0;
  lastSeenChaosId = null;

  clearSession();
  dialogueLines = [];
  localChaosEvents = [];
  chaosList.innerHTML = "";
  currentScene = "";
  currentSharedGoal = "";
  currentSpeakingConstraint = "";
  currentSelections = null;
  claimedBy = new Set();
  sceneCard.classList.add("hidden");
  sceneCompleteBanner.classList.add("hidden");
  chaosDisplay.classList.add("hidden");
  renderDialogueLog();
  enterLobbyMode();
}

// --- Polling ---

function startPolling() {
  if (pollInterval) return;
  pollRoomState(); // immediate first poll, then every 2s
  pollInterval = setInterval(pollRoomState, 2000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

async function pollRoomState() {
  if (!roomState.roomId) return;

  try {
    const res = await fetch("/api/get-room?roomId=" + encodeURIComponent(roomState.roomId));

    if (!res.ok) {
      if (res.status === 404) {
        // Room is gone (server restart or expired) — clear stale session and go back to lobby
        resetAndReturnToLobby();
      }
      return;
    }

    const data = await res.json();
    updateFromRoomState(data.room);
  } catch (e) {
    // Network error — silently retry on next poll
  }
}

function updateFromRoomState(room) {
  // --- Status change ---
  if (room.status !== lastKnownRoomStatus) {
    lastKnownRoomStatus = room.status;

    if (room.status === "waiting") {
      showStatus("Waiting for another player… Share code: " + room.roomId);
    } else if (room.status === "ready") {
      if (roomState.playerRole === "A") {
        showStatus("Both players are here. You can start the scene.");
      } else {
        showStatus("Waiting for the host to start the scene.");
      }
    } else if (room.status === "playing") {
      clearStatus();
    } else if (room.status === "ended") {
      showRoomEndedState();
    }
  }

  // --- Scene sync: render once when sceneText first appears or changes ---
  if (room.sceneText && room.sceneText !== lastKnownSceneText) {
    lastKnownSceneText = room.sceneText;
    applyRoomScene(room);
  }

  // --- Dialogue sync: rebuild log when new lines arrive ---
  if (room.dialogueLines && room.dialogueLines.length !== lastKnownDialogueLength) {
    syncDialogueFromRoom(room);
  }

  // --- Chaos sync: rebuild list and play sound only when a new event arrives ---
  if (room.chaosEvents && room.chaosEvents.length > 0) {
    const latest = room.chaosEvents[room.chaosEvents.length - 1];
    if (latest.id !== lastSeenChaosId) {
      lastSeenChaosId = latest.id;
      renderChaosFromRoom(room.chaosEvents, true);
    }
  }

  // --- Turn control: keep input state in sync every poll while playing ---
  if (room.status === "playing" && roomState.playerRole) {
    updateTurnControls(room.currentTurn);
  }
}

// Renders the scene card from room data — used by Player B (and on reconnect).
// Player A's scene is rendered directly by handleGenerateScene with typewriter;
// lastKnownSceneText is set there to prevent this from firing a second time.
function applyRoomScene(room) {
  currentScene = room.sceneText;
  currentSharedGoal = room.sharedGoal;
  currentSpeakingConstraint = room.speakingConstraint;
  currentSelections = room.world
    ? { world: room.world, relationship: room.relationship, scene: room.scene }
    : null;

  if (currentSelections) renderSceneMeta(currentSelections);

  sceneGoalBlock.classList.add("hidden");
  sceneConstraintBlock.classList.add("hidden");
  claimedBy = new Set();
  sceneCompleteBanner.classList.add("hidden");

  showSceneCard();
  sceneBody.classList.remove("is-loading");
  typewriteText(sceneBody, room.sceneText, 12, () => {
    sceneGoalBlock.classList.remove("hidden");
    typewriteText(sceneGoalText, room.sharedGoal, 15, () => {
      sceneConstraintBlock.classList.remove("hidden");
      typewriteText(sceneConstraintText, room.speakingConstraint, 15);
    });
  });

  dialogueLines = [];
  localChaosEvents = [];
  chaosList.innerHTML = "";
  chaosDisplay.classList.add("hidden");
  lastKnownDialogueLength = 0;
  lastSeenChaosId = null;
  renderDialogueLog();
}

function showRoomEndedState() {
  stopPolling();

  // Disable all gameplay controls so nothing can be submitted
  dialogueInput.disabled = true;
  btnAddLine.disabled = true;
  btnClaim.disabled = true;
  btnChaos.disabled = true;
  btnGenerate.disabled = true;
  btnLeaveRoom.disabled = true;

  roomEndedModal.classList.remove("hidden");
}

// --- Start ---

document.addEventListener("DOMContentLoaded", init);
