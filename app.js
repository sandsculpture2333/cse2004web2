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

const inputCustomWorld        = document.getElementById("input-custom-world");
const inputCustomRelationship = document.getElementById("input-custom-relationship");
const inputCustomSituation    = document.getElementById("input-custom-situation");

const btnGenerate  = document.getElementById("btn-generate");
const btnRead      = document.getElementById("btn-read");
const btnChaos     = document.getElementById("btn-chaos");
const btnAddLine   = document.getElementById("btn-add-line");

const sceneCard    = document.getElementById("scene-card");
const sceneMeta    = document.getElementById("scene-meta");
const sceneBody    = document.getElementById("scene-body");
const sceneGoalBlock       = document.getElementById("scene-goal-block");
const sceneGoalText        = document.getElementById("scene-goal-text");
const sceneConstraintBlock = document.getElementById("scene-constraint-block");
const sceneConstraintText  = document.getElementById("scene-constraint-text");
const sceneTriggerBlock    = document.getElementById("scene-trigger-block");
const sceneTriggerText     = document.getElementById("scene-trigger-text");

const chaosDisplay      = document.getElementById("chaos-display");
const chaosList         = document.getElementById("chaos-list");
const chaosAvailability = document.getElementById("chaos-availability");
const appToast          = document.getElementById("app-toast");
const chaosSound        = new Audio("chaos.mp3");

const dialogueLog   = document.getElementById("dialogue-log");
const dialogueInput = document.getElementById("dialogue-input");

const statusMessage = document.getElementById("status-message");

const speakerIndicator   = document.getElementById("speaker-indicator");
const btnMic             = document.getElementById("btn-mic");
const btnClaim           = document.getElementById("btn-claim");
const btnEndManual       = document.getElementById("btn-end-manual");
const btnReport          = document.getElementById("btn-report");
const reportModal        = document.getElementById("report-modal");
const retractLinePreview = document.getElementById("retract-line-preview");
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
const roomStatusStrip  = document.getElementById("room-status-strip");
const roomStatusText   = document.getElementById("room-status-text");
const lobbyPanel       = document.getElementById("lobby-panel");
const inputPlayerName  = document.getElementById("input-player-name");
const btnCreateRoom    = document.getElementById("btn-create-room");
const inputRoomCode    = document.getElementById("input-room-code");
const btnJoinRoom      = document.getElementById("btn-join-room");
const btnLobbyGuide    = document.getElementById("btn-lobby-guide");
const lobbyGuide       = document.getElementById("lobby-guide");
const btnGuideDismiss  = document.getElementById("btn-guide-dismiss");
const btnInfoSetup     = document.getElementById("btn-info-setup");
const infoSetup        = document.getElementById("info-setup");
const btnInfoScene     = document.getElementById("btn-info-scene");
const infoScene        = document.getElementById("info-scene");
const btnInfoDialogue  = document.getElementById("btn-info-dialogue");
const infoDialogue     = document.getElementById("info-dialogue");
const roomInfoBar           = document.getElementById("room-info-bar");
const roomInfoCode          = document.getElementById("room-info-code");
const roomInfoRole          = document.getElementById("room-info-role");
const roomInfoSceneRoleItem = document.getElementById("room-info-scene-role-item");
const roomInfoSceneRole     = document.getElementById("room-info-scene-role");
const roomInfoName          = document.getElementById("room-info-name");
const btnLeaveRoom          = document.getElementById("btn-leave-room");
const setupPanel            = document.getElementById("setup-panel");
const dialoguePanel         = document.getElementById("dialogue-panel");
const speakerToggle         = document.querySelector(".speaker-toggle");
const roleAssignmentGroup   = document.getElementById("role-assignment-group");
const roleChooser           = document.getElementById("role-chooser");
const roleChooserOptions    = document.getElementById("role-chooser-options");

// --- State ---

let currentScene = "";
let currentSharedGoal = "";
let currentSpeakingConstraint = "";
let currentTriggerDefinition = "";
let currentSelections = null;
let dialogueLines = []; // each entry: { speaker: "A" | "B", text: string }
let localChaosEvents = []; // local-mode chaos chain: array of text strings
let claimedBy = new Set(); // tracks which players ("A", "B") have confirmed completion
let isChaosLoading = false; // guard against rapid duplicate requests
let chaosToastTimer = null;

// --- Room State ---

const CHAOS_MAX_EVENTS = 5;
const CHAOS_LINES_GAP  = 10;

let roomState = {
  playerId: null,
  playerName: null,
  roomId: null,
  playerRole: null,       // "A" or "B", null when playing locally
  cachedChaosEvents: [],  // kept in sync by polling for defensive availability checks
};

let playerNames = { A: null, B: null }; // populated from room data; used for display labels

function getDisplayName(role) {
  return playerNames[role] || `Player ${role}`;
}

function getRoleAssignmentMode() {
  const checked = document.querySelector('input[name="role-assignment"]:checked');
  return checked ? checked.value : "random";
}

function applySceneRoles(sceneRoles) {
  if (!roomState.playerRole || !sceneRoles) return;
  const myRole = sceneRoles[roomState.playerRole];
  if (!myRole) return;
  roomInfoSceneRole.textContent = myRole;
  roomInfoSceneRoleItem.classList.remove("hidden");
}

function showRoleChooser(roleOptions) {
  roleChooserOptions.innerHTML = "";
  roleOptions.forEach((label, i) => {
    const btn = document.createElement("button");
    btn.className = "btn-role-option";
    btn.textContent = label;
    btn.addEventListener("click", () => handleAssignRole(i === 0));
    roleChooserOptions.appendChild(btn);
  });
  roleChooser.classList.remove("hidden");
}

async function handleAssignRole(hostTakesFirst) {
  roleChooser.classList.add("hidden");
  try {
    const res = await fetch("/api/assign-roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: roomState.roomId, playerId: roomState.playerId, hostTakesFirst }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Assignment failed");
    }
    const data = await res.json();
    applySceneRoles(data.sceneRoles);
  } catch (e) {
    showToast("Could not assign roles. Try again.", true);
    roleChooser.classList.remove("hidden");
  }
}

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
  btnClaim.addEventListener("click", handleCheckEnding);
  btnEndManual.addEventListener("click", handleEndManual);
  btnReport.addEventListener("click", handleRetractLine);
  btnRetractConfirm.addEventListener("click", confirmRetractLine);
  btnRetractCancel.addEventListener("click", closeRetractModal);
  btnHelp.addEventListener("click", toggleHelp);
  initMicButton();
  btnModalAccept.addEventListener("click", handleAcceptCompletion);
  btnModalReject.addEventListener("click", handleRejectCompletion);
  document.getElementById("btn-return-to-menu").addEventListener("click", resetAndReturnToLobby);

  // Lobby
  btnCreateRoom.addEventListener("click", handleCreateRoom);
  btnJoinRoom.addEventListener("click", handleJoinRoom);
  // Auto-expand on first visit or when ?tutorial=1 is in the URL (useful for testing)
  const forceTutorial = new URLSearchParams(location.search).has("tutorial");
  if (forceTutorial || !localStorage.getItem("sceneTrapTutorialSeen")) openGuide();
  btnLobbyGuide.addEventListener("click", () => {
    if (lobbyGuide.classList.contains("hidden")) {
      openGuide();
    } else {
      closeGuide();
    }
  });
  btnGuideDismiss.addEventListener("click", closeGuide);
  btnInfoSetup.addEventListener("click",    () => toggleCardInfo(btnInfoSetup,    infoSetup));
  btnInfoScene.addEventListener("click",    () => toggleCardInfo(btnInfoScene,    infoScene));
  btnInfoDialogue.addEventListener("click", () => toggleCardInfo(btnInfoDialogue, infoDialogue));
  btnLeaveRoom.addEventListener("click", handleLeaveRoom);
  inputRoomCode.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleJoinRoom();
  });
  inputPlayerName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCreateRoom();
  });
}

// --- Helpers ---

function getScenarioInputs() {
  const trim = (s) => (s || "").trim().slice(0, 160);
  const customWorld        = trim(inputCustomWorld.value);
  const customRelationship = trim(inputCustomRelationship.value);
  const customSituation    = trim(inputCustomSituation.value);
  return {
    world:        customWorld        || selectWorld.value        || "a tense private room",
    relationship: customRelationship || selectRelationship.value || "two people with unresolved history",
    scene:        customSituation    || selectScene.value        || "a confrontation after a past decision changed both of their lives",
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

function showToast(message, type = "info") {
  const resolved = type === true ? "error" : type; // backward-compat with old boolean callers
  clearTimeout(chaosToastTimer);
  appToast.textContent = message;
  appToast.classList.remove("is-error", "is-success");
  if (resolved === "error")   appToast.classList.add("is-error");
  if (resolved === "success") appToast.classList.add("is-success");
  appToast.classList.add("is-visible");
  chaosToastTimer = setTimeout(() => appToast.classList.remove("is-visible"), 4000);
}

function showRoomStatus(message) {
  if (message) {
    roomStatusText.textContent = message;
    roomStatusStrip.classList.remove("hidden");
  } else {
    roomStatusStrip.classList.add("hidden");
    roomStatusText.textContent = "";
  }
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
  speaker.textContent = getDisplayName(entry.speaker);

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
    speaker.textContent = getDisplayName(entry.speaker);

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
  const selections = getScenarioInputs();
  clearStatus();
  renderSceneMeta(selections);
  showSceneCard();

  // Reset scene layers and completion UI from any previous generation
  sceneGoalBlock.classList.add("hidden");
  sceneConstraintBlock.classList.add("hidden");
  sceneTriggerBlock.classList.add("hidden");
  claimedBy = new Set();
  sceneCompleteBanner.classList.add("hidden");
  if (!roomState.roomId) {
    dialogueInput.disabled = false;
    btnAddLine.disabled = false;
  }
  btnClaim.disabled = false;
  btnEndManual.disabled = false;

  // Show a loading state while the API call is in flight
  sceneBody.textContent = "Setting the scene…";
  sceneBody.classList.add("is-loading");
  btnGenerate.disabled = true;

  // In room mode, send credentials so the backend can save the result
  const body = roomState.roomId
    ? { ...selections, roomId: roomState.roomId, playerId: roomState.playerId, assignmentMode: getRoleAssignmentMode() }
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
    currentTriggerDefinition = data.triggerDefinition || "";
    currentSelections = selections;

    // Prevent the next poll from re-rendering this scene for the host.
    // Also clear chaos state here — the host bypasses applyRoomScene which normally does this.
    if (roomState.roomId) {
      lastKnownSceneText = data.sceneText;
      lastKnownDialogueLength = 0;
      dialogueLines = [];
      localChaosEvents = [];
      chaosList.innerHTML = "";
      chaosDisplay.classList.add("hidden");
      lastSeenChaosId = null;
      roomState.cachedChaosEvents = [];
      chaosAvailability.textContent = "";
      // Enable input immediately for the host (Player A goes first) without waiting for the next poll
      if (data.room) updateTurnControls(data.room.currentTurn);

      // Apply or prompt for role assignment
      if (data.roleAssignmentPending && roomState.playerRole === "A") {
        showRoleChooser(data.roleOptions);
      } else if (data.sceneRoles) {
        applySceneRoles(data.sceneRoles);
      }
    }

    sceneBody.classList.remove("is-loading");
    typewriteText(sceneBody, currentScene, 12);

    sceneGoalBlock.classList.remove("hidden");
    typewriteText(sceneGoalText, data.sharedGoal, 15);

    sceneConstraintBlock.classList.remove("hidden");
    typewriteText(sceneConstraintText, data.constraint, 15);

    if (currentTriggerDefinition) {
      sceneTriggerBlock.classList.remove("hidden");
      typewriteText(sceneTriggerText, currentTriggerDefinition, 15);
    }

    dialogueLines = [];
    renderDialogueLog();

  } catch (error) {
    sceneBody.classList.remove("is-loading");
    sceneBody.textContent = "";
    showToast(`Could not generate scene: ${error.message}`, true);
  } finally {
    btnGenerate.disabled = false;
  }
}

function handleReadScene() {
  // Button is hidden in UI — SpeechSynthesis is used via speakLine() on each dialogue line instead.
}

// Returns chaos availability based on event history and current line count.
// Pure — takes the two inputs explicitly so it's usable from any context.
function getChaosAvailability(events, lineCount) {
  if (events.length >= CHAOS_MAX_EVENTS) {
    return { canTrigger: false, linesUntilReady: 0, reason: "Maximum chaos events reached." };
  }
  const linesSince = events.length === 0
    ? lineCount
    : lineCount - events[events.length - 1].lineCountAtTrigger;
  if (linesSince < CHAOS_LINES_GAP) {
    const needed = CHAOS_LINES_GAP - linesSince;
    const word = needed === 1 ? "line" : "lines";
    return {
      canTrigger: false,
      linesUntilReady: needed,
      reason: `Chaos unlocks every 10 lines. Next chaos in ${needed} more ${word}.`,
    };
  }
  return { canTrigger: true, linesUntilReady: 0, reason: "Chaos is ready." };
}

// Updates the Trigger Chaos button and hint text from room state.
// Pass null to re-evaluate from cached chaos events (used in finally blocks).
// No-op in local mode — chaos is always available there.
function updateChaosButtonState(room) {
  if (!roomState.roomId) return;
  if (room) {
    roomState.cachedChaosEvents = room.chaosEvents || [];
  }
  const lineCount = room ? (room.dialogueLines?.length ?? dialogueLines.length) : dialogueLines.length;
  const { canTrigger, reason } = getChaosAvailability(roomState.cachedChaosEvents, lineCount);
  if (!isChaosLoading) btnChaos.disabled = !canTrigger;
  chaosAvailability.textContent = reason;
}

async function handleTriggerChaos() {
  // Guard against rapid duplicate clicks
  if (isChaosLoading) return;

  // Defensive availability check — button should already be disabled in room mode
  if (roomState.roomId) {
    const { canTrigger, reason } = getChaosAvailability(
      roomState.cachedChaosEvents,
      dialogueLines.length
    );
    if (!canTrigger) {
      showToast(reason, true);
      return;
    }
  }

  isChaosLoading = true;
  btnChaos.disabled = true;
  chaosAvailability.textContent = "Triggering chaos…";

  try {
    const body = roomState.roomId
      ? { roomId: roomState.roomId, playerId: roomState.playerId }
      : { sceneText: currentScene, constraint: currentSpeakingConstraint };

    const response = await fetch("/api/chaos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      showToast(data.error || "Chaos generation failed. Please try again.", true);
      if (roomState.roomId) {
        // Show rejection reason in the hint; button stays disabled until next poll re-evaluates
        chaosAvailability.textContent = data.error || "";
      }
      return;
    }

    if (roomState.roomId && data.room) {
      const events = data.room.chaosEvents;
      if (events && events.length > 0) {
        lastSeenChaosId = events[events.length - 1].id;
      }
      renderChaosFromRoom(data.room.chaosEvents, true);
      updateChaosButtonState(data.room); // updates cachedChaosEvents with new event
    } else {
      localChaosEvents.push(data.text);
      renderLocalChaos(true);
    }

  } catch (error) {
    showToast("Chaos generation failed. Please try again.", true);
    if (roomState.roomId) chaosAvailability.textContent = "";
  } finally {
    isChaosLoading = false;
    if (roomState.roomId) {
      // Room mode: button stays disabled until the next poll re-evaluates availability
      // from fresh server state. This ensures both players stay in sync — if another
      // player already triggered chaos, we don't accidentally re-enable with stale cache.
    } else {
      btnChaos.disabled = false;
      chaosAvailability.textContent = "";
    }
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
        showToast(err.error || "Could not send line.", true);
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
      showToast("Could not send line.", true);
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
  dialogueLines = room.dialogueLines.map((l) => ({ speaker: l.playerRole, text: l.text }));
  renderDialogueLog();
  updateChaosButtonState(room);
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
    speakerIndicator.textContent = "— " + getDisplayName(currentTurn) + "'s turn —";
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
      showToast("Microphone permission denied. Enable it in browser settings.", true);
    }
  });

  btnMic.addEventListener("click", () => {
    btnMic.classList.add("is-listening");
    recognition.start();
  });
}

// --- Completion Flow ---

async function handleCheckEnding() {
  if (!roomState.roomId) {
    showToast("AI ending check is available in room mode only.", true);
    return;
  }

  btnClaim.disabled = true;
  btnClaim.textContent = "Checking ending…";

  try {
    const res = await fetch("/api/check-ending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: roomState.roomId, playerId: roomState.playerId }),
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || "Ending check failed.", true);
      return;
    }

    if (data.completed) {
      showSceneEndedBanner("Scene complete: " + data.reason);
    } else {
      showToast("Not complete yet: " + data.reason);
    }

  } catch (e) {
    showToast("Ending check failed. Please try again.", true);
  } finally {
    if (sceneCompleteBanner.classList.contains("hidden")) {
      btnClaim.disabled = false;
      btnClaim.textContent = "Check Ending";
    }
  }
}

function handleEndManual() {
  completionModal.classList.remove("hidden");
  btnModalAccept.focus();
}

async function handleAcceptCompletion() {
  completionModal.classList.add("hidden");

  if (roomState.roomId) {
    try {
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 4000);
      await fetch("/api/end-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: roomState.roomId, playerId: roomState.playerId }),
        signal: abort.signal,
      });
      clearTimeout(timeout);
    } catch (e) {
      // proceed regardless — ended state still rendered locally
    }
    // Show the same ended state the other player sees via polling,
    // so both clients render the same UI immediately.
    showRoomEndedState();
  } else {
    // Local/solo mode: just show the inline banner.
    showSceneEndedBanner("The scene has been manually ended.");
  }
}

function handleRejectCompletion() {
  completionModal.classList.add("hidden");
  btnEndManual.focus();
}

function showSceneEndedBanner(message) {
  stopPolling();
  lastKnownRoomStatus = "ended"; // prevent polling callback from re-firing

  // Clear transient status indicators (mirrors showRoomEndedState for consistency)
  showRoomStatus("");
  speakerIndicator.textContent = "";
  chaosAvailability.textContent = "";

  sceneCompleteBanner.classList.remove("hidden");
  sceneCompleteBanner.querySelector(".complete-eyebrow").textContent = "SCENE CONCLUDED";
  sceneCompleteBanner.querySelector(".complete-message").textContent = message;

  dialogueInput.disabled = true;
  btnAddLine.disabled = true;
  btnClaim.disabled = true;
  btnEndManual.disabled = true;
  btnChaos.disabled = true;
  btnGenerate.disabled = true;
  // Leave button remains enabled so players can exit when ready

  // In room mode show the return modal so both players have a clear exit path.
  // (Local mode uses the inline banner only — no room to leave.)
  if (roomState.roomId) {
    roomEndedModal.querySelector(".modal-eyebrow").textContent = "SCENE COMPLETE";
    roomEndedModal.querySelector(".modal-heading").textContent = "This scene has ended.";
    roomEndedModal.classList.remove("hidden");
  }
}

// --- Retract Flow ---

function handleRetractLine() {
  const last = dialogueLines[dialogueLines.length - 1];
  if (!last) {
    showToast("No lines to retract.", true);
    return;
  }
  retractLinePreview.textContent = `${getDisplayName(last.speaker)}: "${last.text}"`;
  reportModal.classList.remove("hidden");
  btnRetractConfirm.focus();
}

async function confirmRetractLine() {
  reportModal.classList.add("hidden");

  if (roomState.roomId) {
    try {
      const res = await fetch("/api/retract-line", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: roomState.roomId, playerId: roomState.playerId }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "Retract failed.", true);
        return;
      }
      syncDialogueFromRoom(data.room);
      updateTurnControls(data.room.currentTurn);
      showToast("Last line retracted.", "success");
    } catch (e) {
      showToast("Retract failed. Please try again.", true);
    }
  } else {
    if (dialogueLines.length === 0) return;
    dialogueLines.pop();
    renderDialogueLog();
    showToast("Last line retracted.");
  }
}

function closeRetractModal() {
  reportModal.classList.add("hidden");
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

function toggleCardInfo(btn, panel) {
  // Close all sibling panels so only one is open at a time
  [[btnInfoSetup, infoSetup], [btnInfoScene, infoScene], [btnInfoDialogue, infoDialogue]]
    .forEach(([b, p]) => {
      if (b !== btn) { p.classList.add("hidden"); b.setAttribute("aria-expanded", "false"); }
    });
  const isNowHidden = panel.classList.toggle("hidden");
  btn.setAttribute("aria-expanded", String(!isNowHidden));
}

function openGuide() {
  lobbyGuide.classList.remove("hidden");
  btnLobbyGuide.textContent = "Hide walkthrough ▴";
  btnLobbyGuide.setAttribute("aria-expanded", "true");
}

function closeGuide() {
  lobbyGuide.classList.add("hidden");
  btnLobbyGuide.textContent = "New here? View quick walkthrough ▾";
  btnLobbyGuide.setAttribute("aria-expanded", "false");
  localStorage.setItem("sceneTrapTutorialSeen", "true");
}

function enterLobbyMode() {
  stopPolling();
  lobbyPanel.classList.remove("hidden");
  roomInfoBar.classList.add("hidden");
  roomStatusStrip.classList.add("hidden");
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
    roleAssignmentGroup.classList.remove("hidden");
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

    showRoomStatus("Connecting to room…");
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
    showToast("Please enter a display name.", true);
    return;
  }

  btnCreateRoom.disabled = true;

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
      cachedChaosEvents: [],
    };
    saveSession();
    enterGameMode(true);
  } catch (error) {
    showToast("Could not create room: " + error.message, true);
  } finally {
    btnCreateRoom.disabled = false;
  }
}

async function handleJoinRoom() {
  const name = inputPlayerName.value.trim();
  if (!name) {
    showToast("Please enter a display name.", true);
    return;
  }

  const code = inputRoomCode.value.trim().toUpperCase();
  if (!code || code.length < 4) {
    showToast("Please enter a valid 4-character room code.", true);
    return;
  }

  btnJoinRoom.disabled = true;

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
      cachedChaosEvents: [],
    };
    saveSession();
    enterGameMode(true);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    btnJoinRoom.disabled = false;
  }
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

  showToast("Room ended.", "info");
  resetAndReturnToLobby();
}

function resetAndReturnToLobby() {
  roomEndedModal.classList.add("hidden");

  // Re-enable and restore controls that may have been locked for room mode
  dialogueInput.disabled = false;
  btnAddLine.disabled = false;
  btnClaim.disabled = false;
  btnEndManual.disabled = false;
  btnChaos.disabled = false;
  btnGenerate.disabled = false;
  btnGenerate.textContent = "Enter the Scene";
  btnClaim.textContent = "Check Ending";
  btnLeaveRoom.disabled = false;

  lastKnownSceneText = "";
  lastKnownDialogueLength = 0;
  lastSeenChaosId = null;
  playerNames = { A: null, B: null };
  roomInfoSceneRoleItem.classList.add("hidden");
  roomInfoSceneRole.textContent = "";
  roleChooser.classList.add("hidden");
  roleChooserOptions.innerHTML = "";
  roleAssignmentGroup.classList.add("hidden");

  clearSession();
  dialogueLines = [];
  localChaosEvents = [];
  chaosList.innerHTML = "";
  roomState.cachedChaosEvents = [];
  chaosAvailability.textContent = "";
  currentScene = "";
  currentSharedGoal = "";
  currentSpeakingConstraint = "";
  currentTriggerDefinition = "";
  currentSelections = null;
  claimedBy = new Set();
  sceneCard.classList.add("hidden");
  sceneCompleteBanner.classList.add("hidden");
  chaosDisplay.classList.add("hidden");
  sceneTriggerBlock.classList.add("hidden");
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
        stopPolling();
        showToast("Room no longer exists.", true);
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
  // --- Sync player display names from room ---
  if (room.players) {
    if (room.players.A?.name) playerNames.A = room.players.A.name;
    if (room.players.B?.name) playerNames.B = room.players.B.name;
  }

  // --- Sync scene role assignment ---
  if (room.sceneRoles?.A && !room.roleAssignmentPending) {
    applySceneRoles(room.sceneRoles);
    roleChooser.classList.add("hidden");
  }

  // --- Status change ---
  if (room.status !== lastKnownRoomStatus) {
    lastKnownRoomStatus = room.status;

    if (room.status === "waiting") {
      showRoomStatus("Waiting for another player… Share code: " + room.roomId);
    } else if (room.status === "ready") {
      if (roomState.playerRole === "A") {
        showRoomStatus("Both players are here. You can start the scene.");
      } else {
        showRoomStatus("Waiting for the host to start the scene.");
      }
    } else if (room.status === "playing") {
      showRoomStatus("");
    } else if (room.status === "complete") {
      showSceneEndedBanner("Scene complete: " + (room.completionReason || "The objective was achieved."));
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

  // --- Chaos sync: rebuild list when new events arrive; clear if room reset to empty ---
  if (room.chaosEvents && room.chaosEvents.length > 0) {
    const latest = room.chaosEvents[room.chaosEvents.length - 1];
    if (latest.id !== lastSeenChaosId) {
      lastSeenChaosId = latest.id;
      renderChaosFromRoom(room.chaosEvents, true);
      updateChaosButtonState(room);
    }
  } else if (!chaosDisplay.classList.contains("hidden")) {
    // Room has no chaos events (new scene generated) but display is still visible — clear it
    lastSeenChaosId = null;
    roomState.cachedChaosEvents = [];
    chaosList.innerHTML = "";
    chaosDisplay.classList.add("hidden");
    chaosAvailability.textContent = "";
  }

  // --- Turn control + chaos availability: keep controls in sync every poll while playing ---
  if (room.status === "playing" && roomState.playerRole) {
    updateTurnControls(room.currentTurn);
    updateChaosButtonState(room);
  }
}

// Renders the scene card from room data — used by Player B (and on reconnect).
// Player A's scene is rendered directly by handleGenerateScene with typewriter;
// lastKnownSceneText is set there to prevent this from firing a second time.
function applyRoomScene(room) {
  currentScene = room.sceneText;
  currentSharedGoal = room.sharedGoal;
  currentSpeakingConstraint = room.speakingConstraint;
  currentTriggerDefinition = room.triggerDefinition || "";
  currentSelections = room.world
    ? { world: room.world, relationship: room.relationship, scene: room.scene }
    : null;

  if (currentSelections) renderSceneMeta(currentSelections);

  sceneGoalBlock.classList.add("hidden");
  sceneConstraintBlock.classList.add("hidden");
  sceneTriggerBlock.classList.add("hidden");
  claimedBy = new Set();
  sceneCompleteBanner.classList.add("hidden");

  showSceneCard();
  sceneBody.classList.remove("is-loading");
  typewriteText(sceneBody, room.sceneText, 12, () => {
    sceneGoalBlock.classList.remove("hidden");
    typewriteText(sceneGoalText, room.sharedGoal, 15, () => {
      sceneConstraintBlock.classList.remove("hidden");
      typewriteText(sceneConstraintText, room.speakingConstraint, 15, () => {
        if (currentTriggerDefinition) {
          sceneTriggerBlock.classList.remove("hidden");
          typewriteText(sceneTriggerText, currentTriggerDefinition, 15);
        }
      });
    });
  });

  dialogueLines = [];
  localChaosEvents = [];
  chaosList.innerHTML = "";
  chaosDisplay.classList.add("hidden");
  lastKnownDialogueLength = 0;
  // On reconnect, room.chaosEvents may already have events. Silently acknowledge them
  // so the next poll doesn't replay the sound. On a fresh generation chaosEvents is [],
  // so this resets to null and the next real chaos event will play correctly.
  lastSeenChaosId = (room.chaosEvents?.length > 0)
    ? room.chaosEvents[room.chaosEvents.length - 1].id
    : null;
  roomState.cachedChaosEvents = [];
  chaosAvailability.textContent = "";
  renderDialogueLog();
}

function showRoomEndedState() {
  stopPolling();
  lastKnownRoomStatus = "ended";

  // Clear transient UI so nothing misleading remains visible
  showRoomStatus("");
  speakerIndicator.textContent = "";
  chaosAvailability.textContent = "";

  // Disable all gameplay controls — transcript stays visible underneath the modal
  dialogueInput.disabled = true;
  btnAddLine.disabled = true;
  btnClaim.disabled = true;
  btnEndManual.disabled = true;
  btnChaos.disabled = true;
  btnGenerate.disabled = true;

  roomEndedModal.querySelector(".modal-eyebrow").textContent = "ROOM ENDED";
  roomEndedModal.querySelector(".modal-heading").textContent = "This room has ended.";
  roomEndedModal.classList.remove("hidden");
}

// --- Start ---

document.addEventListener("DOMContentLoaded", init);
