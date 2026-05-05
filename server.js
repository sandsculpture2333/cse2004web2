// ===========================
//  Scene Trap — server.js
// ===========================

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" }); // Vercel pulls env vars here
dotenv.config();                        // fallback to .env
import express from "express";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createRoom, getRoom, updateRoom, endRoom } from "./api/room-store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json());

// Serve the frontend files from the same directory
app.use(express.static(__dirname));

// ===========================
//  POST /api/generate
//  Generates a playable scene setup from the four selections.
// ===========================
const GENERATE_COOLDOWN_MS = 30_000;

app.post("/api/generate", async (req, res) => {
  const { world, relationship, scene, roomId, playerId, assignmentMode = "random" } = req.body;

  if (!world || !relationship || !scene) {
    return res.status(400).json({ error: "Missing one or more required fields." });
  }

  // Room mode: validate host before spending AI tokens
  if (roomId) {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.players.A?.id !== playerId) {
      return res.status(403).json({ error: "Only the host can generate the scene." });
    }
    if (room.lastGenerateAt && Date.now() - room.lastGenerateAt < GENERATE_COOLDOWN_MS) {
      const waitSecs = Math.ceil((GENERATE_COOLDOWN_MS - (Date.now() - room.lastGenerateAt)) / 1000);
      return res.status(429).json({ error: `Scene was just generated. Please wait ${waitSecs}s.` });
    }
  }

  try {
    // Step 1: generate the scene setup; retry once with a shorter prompt if truncated
    let sceneText;
    try {
      sceneText = await callOpenAI(buildScenePrompt({ world, relationship, scene }), 4000);
    } catch (sceneError) {
      if (sceneError.message.includes("incomplete") && sceneError.message.includes("max_output_tokens")) {
        console.warn("Scene truncated — retrying with fallback prompt");
        try {
          sceneText = await callOpenAI(buildFallbackScenePrompt({ world, relationship, scene }), 4000);
        } catch (fallbackError) {
          throw new Error(`Scene setup generation failed: ${fallbackError.message}`);
        }
      } else {
        throw new Error(`Scene setup generation failed: ${sceneError.message}`);
      }
    }

    // Step 2: generate shared goal — constraint and trigger both need it
    const sharedGoal = await callOpenAI(buildSharedGoalPrompt({ sceneText }), 1500);

    // Step 3, 4, 5: generate constraint, trigger, and roles in parallel
    const [constraintResult, triggerResult, rolesResult] = await Promise.allSettled([
      callOpenAI(buildConstraintPrompt({ sceneText, sharedGoal }), 1500),
      callOpenAI(buildTriggerPrompt({ sceneText, sharedGoal }), 1000),
      roomId ? callOpenAI(buildRolesPrompt({ sceneText }), 1000) : Promise.resolve(""),
    ]);

    if (constraintResult.status === "rejected") {
      throw new Error(`Speaking constraint generation failed: ${constraintResult.reason.message}`);
    }

    const constraint = constraintResult.value;
    let triggerDefinition = "";
    if (triggerResult.status === "fulfilled") {
      triggerDefinition = triggerResult.value;
    } else {
      console.warn("Trigger definition generation failed (non-fatal):", triggerResult.reason.message);
    }

    let roleOptions = ["Character A", "Character B"];
    if (roomId) {
      if (rolesResult.status === "fulfilled" && rolesResult.value) {
        roleOptions = parseRoles(rolesResult.value);
      } else if (rolesResult.status === "rejected") {
        console.warn("Role generation failed (non-fatal):", rolesResult.reason?.message);
      }
    }

    // Room mode: persist generated content and set status to "playing"
    if (roomId) {
      let sceneRoles, roleAssignmentPending;
      if (assignmentMode === "host") {
        sceneRoles = { A: null, B: null };
        roleAssignmentPending = true;
      } else {
        const flip = Math.random() < 0.5;
        sceneRoles = {
          A: flip ? roleOptions[1] : roleOptions[0],
          B: flip ? roleOptions[0] : roleOptions[1],
        };
        roleAssignmentPending = false;
      }

      const updatedRoom = await updateRoom(roomId, (r) => ({
        ...r,
        sceneText,
        sharedGoal,
        speakingConstraint: constraint,
        triggerDefinition,
        world,
        relationship,
        scene,
        status: "playing",
        dialogueLines: [],
        chaosEvents: [],
        currentTurn: "A",
        roleOptions,
        sceneRoles,
        roleAssignmentPending,
        lastGenerateAt: Date.now(),
      }));
      if (!updatedRoom) return res.status(404).json({ error: "Room not found — it may have expired. Please create a new room." });
      return res.json({ sceneText, sharedGoal, constraint, triggerDefinition, roleOptions, sceneRoles, roleAssignmentPending, room: updatedRoom });
    }

    res.json({ sceneText, sharedGoal, constraint, triggerDefinition });

  } catch (error) {
    console.error("Scene generation error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ===========================
//  POST /api/chaos
//  Generates a disruptive event that increases scene pressure.
// ===========================
const MAX_CHAOS_EVENTS = 5;
const LINES_BETWEEN = 10;

function buildChaosPromptForRoom(room, stripContext = false) {
  const recentLines = stripContext ? [] : (room.dialogueLines || []).slice(-8);
  const prevChaos = (room.chaosEvents || []).slice(-2);
  return buildChaosPrompt({
    sceneText: room.sceneText,
    sharedGoal: room.sharedGoal,
    speakingConstraint: room.speakingConstraint,
    recentLines,
    previousChaosEvents: prevChaos,
  });
}

app.post("/api/chaos", async (req, res) => {
  const { roomId, playerId, sceneText, constraint } = req.body;

  // --- Room mode ---
  if (roomId) {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isPlayerA = room.players.A?.id === playerId;
    const isPlayerB = room.players.B?.id === playerId;
    if (!isPlayerA && !isPlayerB) {
      return res.status(403).json({ error: "Player not in this room" });
    }

    const events = room.chaosEvents || [];
    const lines = room.dialogueLines || [];

    if (events.length >= MAX_CHAOS_EVENTS) {
      return res.status(400).json({ error: "Maximum chaos events reached." });
    }
    const linesSince = events.length === 0
      ? lines.length
      : lines.length - events[events.length - 1].lineCountAtTrigger;
    if (linesSince < LINES_BETWEEN) {
      const needed = LINES_BETWEEN - linesSince;
      const word = needed === 1 ? "line" : "lines";
      return res.status(400).json({
        error: `Chaos unlocks every 10 lines. Next chaos in ${needed} more ${word}.`,
      });
    }

    const initialEventsCount = events.length;

    try {
      let text;
      try {
        text = await callOpenAI(buildChaosPromptForRoom(room, false), 1500);
      } catch (err) {
        if (err.message.includes("incomplete")) {
          text = await callOpenAI(buildChaosPromptForRoom(room, true), 1500);
        } else {
          throw err;
        }
      }

      const event = {
        id: Date.now().toString(),
        text,
        triggeredBy: isPlayerA ? "A" : "B",
        createdAt: Date.now(),
        lineCountAtTrigger: lines.length,
      };

      const updatedRoom = await updateRoom(roomId, (r) => {
        const fresh = r.chaosEvents || [];
        if (fresh.length > initialEventsCount) return r;
        if (fresh.length >= MAX_CHAOS_EVENTS) return r;
        return { ...r, chaosEvents: [...fresh, event] };
      });

      if (!updatedRoom || updatedRoom.chaosEvents.length <= initialEventsCount) {
        return res.status(409).json({
          error: "Chaos was already triggered. Wait for 10 more dialogue lines.",
        });
      }

      return res.json({ text, room: updatedRoom });
    } catch (error) {
      console.error("Chaos generation error (room):", error.message);
      return res.status(500).json({ error: error.message });
    }
  }

  // --- Local/solo mode ---
  try {
    const text = await callOpenAI(
      buildChaosPrompt({ sceneText, sharedGoal: "", speakingConstraint: constraint }),
      1500
    );
    res.json({ text });
  } catch (error) {
    console.error("Chaos generation error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ===========================
//  Room routes — backed by Upstash Redis via api/room-store.js
// ===========================

app.post("/api/create-room", async (req, res) => {
  const { playerId, playerName } = req.body || {};
  if (!playerId || !playerName) {
    return res.status(400).json({ error: "Missing playerId or playerName" });
  }
  try {
    const room = await createRoom({ playerId, playerName });
    res.json({ roomId: room.roomId, playerRole: "A", room });
  } catch (err) {
    console.error("[create-room]", err.message);
    res.status(500).json({ error: "Failed to create room" });
  }
});

app.post("/api/join-room", async (req, res) => {
  const { roomId, playerId, playerName } = req.body || {};
  if (!roomId || !playerId || !playerName) {
    return res.status(400).json({ error: "Missing roomId, playerId, or playerName" });
  }
  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    if (room.players.A?.id === playerId) {
      return res.json({ roomId: room.roomId, playerRole: "A", room });
    }
    if (room.players.B?.id === playerId) {
      return res.json({ roomId: room.roomId, playerRole: "B", room });
    }
    if (!room.players.B) {
      const updated = await updateRoom(roomId, (r) => ({
        ...r,
        players: { ...r.players, B: { id: playerId, name: playerName } },
        status: "ready",
      }));
      return res.json({ roomId: updated.roomId, playerRole: "B", room: updated });
    }
    return res.status(400).json({ error: "Room is full" });
  } catch (err) {
    console.error("[join-room]", err.message);
    res.status(500).json({ error: "Failed to join room" });
  }
});

app.get("/api/get-room", async (req, res) => {
  const { roomId } = req.query;
  if (!roomId) return res.status(400).json({ error: "Missing roomId" });
  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ room });
  } catch (err) {
    console.error("[get-room]", err.message);
    res.status(500).json({ error: "Failed to get room" });
  }
});

app.post("/api/end-room", async (req, res) => {
  const { roomId, playerId } = req.body || {};
  if (!roomId || !playerId) {
    return res.status(400).json({ error: "Missing roomId or playerId" });
  }
  try {
    const room = await endRoom(roomId, playerId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    res.json({ room });
  } catch (err) {
    console.error("[end-room]", err.message);
    res.status(500).json({ error: "Failed to end room" });
  }
});

app.post("/api/assign-roles", async (req, res) => {
  const { roomId, playerId, hostTakesFirst } = req.body || {};
  if (!roomId || !playerId) return res.status(400).json({ error: "Missing roomId or playerId" });
  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.players.A?.id !== playerId) return res.status(403).json({ error: "Only the host can assign roles" });
    if (!room.roleAssignmentPending) return res.status(400).json({ error: "Role assignment already complete" });

    const [roleA, roleB] = room.roleOptions || ["Character A", "Character B"];
    const sceneRoles = hostTakesFirst
      ? { A: roleA, B: roleB }
      : { A: roleB, B: roleA };

    const updated = await updateRoom(roomId, { sceneRoles, roleAssignmentPending: false });
    res.json({ sceneRoles, room: updated });
  } catch (err) {
    console.error("[assign-roles]", err.message);
    res.status(500).json({ error: "Failed to assign roles" });
  }
});

const ENDING_CHECK_COOLDOWN_MS = 15_000;

app.post("/api/check-ending", async (req, res) => {
  const { roomId, playerId } = req.body || {};
  if (!roomId || !playerId) {
    return res.status(400).json({ error: "Missing roomId or playerId" });
  }

  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isPlayerA = room.players.A?.id === playerId;
    const isPlayerB = room.players.B?.id === playerId;
    if (!isPlayerA && !isPlayerB) {
      return res.status(403).json({ error: "Player not in this room" });
    }

    if (!room.sharedGoal || !room.triggerDefinition) {
      return res.status(400).json({ error: "Scene not yet started." });
    }

    if (!room.dialogueLines || room.dialogueLines.length === 0) {
      return res.status(400).json({ error: "No dialogue yet to judge." });
    }

    // Cooldown: prevent rapid re-checks
    if (room.lastEndingCheckAt && Date.now() - room.lastEndingCheckAt < ENDING_CHECK_COOLDOWN_MS) {
      const waitSecs = Math.ceil((ENDING_CHECK_COOLDOWN_MS - (Date.now() - room.lastEndingCheckAt)) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSecs}s before checking again.` });
    }

    const prompt = buildEndingCheckPrompt(room);
    const raw = await callOpenAI(prompt, 1000);

    let result;
    try {
      const cleaned = raw.replace(/^```[a-z]*\n?/i, "").replace(/```\s*$/i, "").trim();
      result = JSON.parse(cleaned);
    } catch {
      throw new Error("AI returned invalid JSON: " + raw);
    }

    const { completed, reason } = result;
    if (typeof completed !== "boolean" || typeof reason !== "string") {
      throw new Error("AI response has unexpected shape: " + raw);
    }

    if (completed) {
      const updatedRoom = await updateRoom(roomId, (r) => ({
        ...r,
        status: "complete",
        completedAt: Date.now(),
        completedBy: playerId,
        completionReason: reason,
        lastEndingCheckAt: Date.now(),
      }));
      return res.json({ completed, reason, room: updatedRoom });
    }

    // Stamp cooldown even on a "not complete" result
    const updatedRoom = await updateRoom(roomId, (r) => ({
      ...r,
      lastEndingCheckAt: Date.now(),
    }));
    return res.json({ completed, reason, room: updatedRoom ?? room });

  } catch (err) {
    console.error("[check-ending]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/send-line", async (req, res) => {
  const { roomId, playerId, text } = req.body || {};
  if (!roomId || !playerId || !text?.trim()) {
    return res.status(400).json({ error: "Missing roomId, playerId, or text" });
  }
  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.status !== "playing") {
      return res.status(400).json({ error: "Scene has not started yet" });
    }

    let role, playerName;
    if (room.players.A?.id === playerId) {
      role = "A";
      playerName = room.players.A.name;
    } else if (room.players.B?.id === playerId) {
      role = "B";
      playerName = room.players.B.name;
    } else {
      return res.status(403).json({ error: "Player not in this room" });
    }

    if (role !== room.currentTurn) {
      return res.status(403).json({ error: "Not your turn" });
    }

    const line = {
      id: Date.now().toString(),
      playerRole: role,
      playerName,
      text: text.trim(),
      createdAt: Date.now(),
    };

    const updatedRoom = await updateRoom(roomId, (r) => ({
      ...r,
      dialogueLines: [...r.dialogueLines, line],
      currentTurn: role === "A" ? "B" : "A",
    }));

    return res.json({ room: updatedRoom, line });
  } catch (err) {
    console.error("[send-line]", err.message);
    res.status(500).json({ error: "Failed to send line" });
  }
});

app.post("/api/retract-line", async (req, res) => {
  const { roomId, playerId } = req.body || {};
  if (!roomId || !playerId) {
    return res.status(400).json({ error: "Missing roomId or playerId" });
  }
  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isPlayerA = room.players.A?.id === playerId;
    const isPlayerB = room.players.B?.id === playerId;
    if (!isPlayerA && !isPlayerB) {
      return res.status(403).json({ error: "Player not in this room" });
    }

    if (!room.dialogueLines || room.dialogueLines.length === 0) {
      return res.status(400).json({ error: "No lines to retract." });
    }

    const updatedRoom = await updateRoom(roomId, (r) => {
      const lines = r.dialogueLines || [];
      if (lines.length === 0) return r;
      const retracted = lines[lines.length - 1];
      return {
        ...r,
        dialogueLines: lines.slice(0, -1),
        currentTurn: retracted.playerRole,
      };
    });

    res.json({ room: updatedRoom });
  } catch (err) {
    console.error("[retract-line]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ===========================
//  Shared OpenAI helper
//  Uses the /v1/responses endpoint.
// ===========================
async function callOpenAI(prompt, maxTokens) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: prompt,
      max_output_tokens: maxTokens,
      reasoning: { effort: "low" },
      text: { format: { type: "text" }, verbosity: "low" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI raw error:", response.status, body);
    throw new Error(`OpenAI ${response.status}: ${body}`);
  }

  const data = await response.json();

  // Guard against incomplete responses (e.g. hit token limit mid-output)
  if (data.status === "incomplete") {
    const reason = data.incomplete_details?.reason ?? "unknown";
    throw new Error(`OpenAI response incomplete (reason: ${reason})`);
  }

  // Prefer the top-level shorthand field if present
  if (data.output_text) {
    return data.output_text.trim();
  }

  // Otherwise scan output[] for the message item, then its output_text content
  const messageItem = data.output?.find((item) => item.type === "message");
  const textItem = messageItem?.content?.find((c) => c.type === "output_text");

  if (!textItem?.text) {
    throw new Error("No text in OpenAI response: " + JSON.stringify(data));
  }

  return textItem.text.trim();
}

// ===========================
//  Prompt Builders
//
//  SCENE EXAMPLE:
//  "The agreement was signed by only one of them that day, after the other failed to
//   show up. The consequences of that decision reshaped both their lives, and neither
//   has addressed it since. Now they are forced to meet again, and this time the
//   silence cannot continue."
//
//  SHARED GOAL EXAMPLE:
//  "Before leaving, one of them must apologize."
//
//  CONSTRAINT EXAMPLE:
//  "Each line must begin with 'I don't'."
//
//  CHAOS EXAMPLE:
//  "It becomes clear that the original decision was based on incomplete or misleading
//   information."
// ===========================

function buildScenePrompt({ world, relationship, scene }) {
  return `
Write a 2–3 sentence opening setup for a two-player dialogue game.

World: ${world}
Relationship: ${relationship}
Situation: ${scene}

Must include:
- one specific past event between them
- the consequence of that event
- why they must face each other now

Rules:
- no dialogue
- no names
- no resolution
- keep it concrete and playable
- focus on conflict, not decorative description
- write in third person — never use "you" or "your"; refer to the characters by their role (e.g. "the heir", "the architect", "the mentor", "the investigator")
- this is a shared document for both players, not addressed to one
`.trim();
}

function buildFallbackScenePrompt({ world, relationship, scene }) {
  return `
Write 2 short sentences for a dialogue game.

World: ${world}
Relationship: ${relationship}
Situation: ${scene}

Include:
- one past conflict
- one consequence
- why they must talk now

No dialogue. No names. Be brief. Write in third person — no "you" or "your". Refer to characters by role.
`.trim();
}

function buildSharedGoalPrompt({ sceneText }) {
  return `
Write one sentence (max 25 words): the objective for a two-player dialogue game.

Scene: ${sceneText}

State the specific action that must happen through dialogue for the scene to be complete. Be concrete and action-based. No vague emotions. No "they must understand each other." Write in third person — no "you" or "your".
`.trim();
}

function buildConstraintPrompt({ sceneText, sharedGoal }) {
  const goalLine = sharedGoal ? `\nObjective: ${sharedGoal}` : "";
  return `
Write one sentence (max 25 words): a speaking rule for a two-player dialogue game.

Scene: ${sceneText}${goalLine}

The rule must create friction — shaping how players argue, accuse, or reveal. Keep it short and immediately memorable.

Use one of these types:
- Forbidden word or topic (e.g. "players may not name the event directly until one has asked a question")
- Required move (e.g. "each player must ask a question before making an accusation")
- Restraint (e.g. "neither player may issue a direct threat")

Do NOT write fixed opening phrases, literary constraints, or rules that make every line sound identical. Write in third person — no "you" or "your". Refer to "players" or by role.
`.trim();
}

function buildTriggerPrompt({ sceneText, sharedGoal }) {
  return `
Write one sentence (max 30 words): a completion trigger for a two-player dialogue game.

Scene: ${sceneText}
Objective: ${sharedGoal}

Describe observable transcript evidence — what a player must say or admit for the scene to count as complete. Be specific and conservative. Write in third person — no "you" or "your". Start with "The scene is complete when…"
`.trim();
}

function buildRolesPrompt({ sceneText }) {
  return `
Write two character role labels for a two-player dialogue game.

Scene: ${sceneText}

Each label should be 1–4 words: a title, relational identity, or role name that fits the scene (e.g. "The Architect", "Estranged Heir", "Crime Analyst", "Informant", "Former Favored Disciple").
They should feel like positions or roles, not character names.

Output exactly two lines:
Line 1: role label for the first character
Line 2: role label for the second character

No numbering. No bullet points. No punctuation at the start. No explanation.
`.trim();
}

function parseRoles(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return [lines[0] || "Character A", lines[1] || "Character B"];
}

function buildEndingCheckPrompt(room) {
  const lines = (room.dialogueLines || [])
    .map((l) => `${l.playerRole}: ${l.text}`)
    .join("\n");

  const recentChaos = (room.chaosEvents || [])
    .slice(-2)
    .map((e) => e.text)
    .join("; ");
  const chaosLine = recentChaos ? `\nChaos events: ${recentChaos}` : "";

  return `
You are judging a two-player dialogue game.

Objective: ${room.sharedGoal}
Completion trigger: ${room.triggerDefinition}${chaosLine}

Transcript:
${lines}

Has the completion trigger been met? Look only for a clear transcript line where a player explicitly says or admits what the trigger requires. Do not infer hidden feelings or intent. If uncertain, return false.

Respond with strict JSON only — no explanation outside the JSON:
{"completed": true, "reason": "one short sentence"}
or
{"completed": false, "reason": "one short sentence"}
`.trim();
}

function buildChaosPrompt({ sceneText, sharedGoal, speakingConstraint, recentLines, previousChaosEvents }) {
  const lineBlock = recentLines && recentLines.length > 0
    ? `\nRecent dialogue:\n${recentLines.map((l) => `${l.playerRole}: ${l.text}`).join("\n")}`
    : "";

  const chaosBlock = previousChaosEvents && previousChaosEvents.length > 0
    ? `\nPrior chaos (do NOT repeat or rephrase these — write a new consequence or escalation):\n${previousChaosEvents.map((e, i) => `${i + 1}. ${e.text}`).join("\n")}`
    : "";

  const constraintNote = speakingConstraint
    ? `\nPlayer speaking rule (for players only — chaos must NOT follow this rule or imitate this style): ${speakingConstraint}`
    : "";

  return `
You are generating an external turning point in a two-player dialogue game.

Scene: ${sceneText}
Goal: ${sharedGoal || "unresolved conflict"}${constraintNote}${lineBlock}${chaosBlock}

WHAT CHAOS IS:
An external fact, document, consequence, or discovery that shifts the moral, emotional, or strategic balance between the two players. It is not spoken by either player. It does not follow any speaking rule.

WHAT CHAOS IS NOT:
- Not dialogue or words spoken by a character
- Not narration in a character's voice
- Not a thought or feeling expressed by either player
- Not a line that starts with or imitates the player speaking rule above

GOOD EXAMPLE:
"An email timestamp proves the transfer was signed hours before the claimed emergency, making the original explanation impossible."

BAD EXAMPLE (do NOT write this):
"If I had known you signed it without my consent, I would have acted differently." — This is player dialogue and imitates a speaking rule.

Requirements:
- Exactly 1 sentence, maximum 35 words
- Must reveal new evidence, shift who seems responsible, or introduce a contradiction, document, or third-party action that gives players new things to argue about
- Avoid: only adding a deadline or time pressure without revealing new information
- If prior chaos exists, escalate or complicate it — do not repeat the same type of event
- Do not resolve the conflict

Prefer: evidence (timestamps, recordings, documents, witnesses), hidden facts, or third-party actions that change what can be argued.

Write the external turning point now.
`.trim();
}

// ===========================
//  Start
// ===========================
app.listen(PORT, () => {
  console.log(`Scene Trap server running at http://localhost:${PORT}`);
});
