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
app.post("/api/generate", async (req, res) => {
  const { world, relationship, scene } = req.body;

  if (!world || !relationship || !scene) {
    return res.status(400).json({ error: "Missing one or more required fields." });
  }

  try {
    // Step 1: generate the scene setup; retry once with a shorter prompt if truncated
    let sceneText;
    try {
      sceneText = await callOpenAI(buildScenePrompt({ world, relationship, scene }), 2000);
    } catch (sceneError) {
      if (sceneError.message.includes("incomplete") && sceneError.message.includes("max_output_tokens")) {
        console.warn("Scene truncated — retrying with fallback prompt");
        try {
          sceneText = await callOpenAI(buildFallbackScenePrompt({ world, relationship, scene }), 2000);
        } catch (fallbackError) {
          throw new Error(`Scene setup generation failed: ${fallbackError.message}`);
        }
      } else {
        throw new Error(`Scene setup generation failed: ${sceneError.message}`);
      }
    }

    // Step 2 & 3: generate shared goal and expression constraint in parallel
    const [sharedGoalResult, constraintResult] = await Promise.allSettled([
      callOpenAI(buildSharedGoalPrompt({ sceneText }), 500),
      callOpenAI(buildConstraintPrompt({ sceneText }), 500),
    ]);

    if (sharedGoalResult.status === "rejected") {
      throw new Error(`Shared goal generation failed: ${sharedGoalResult.reason.message}`);
    }
    if (constraintResult.status === "rejected") {
      throw new Error(`Speaking constraint generation failed: ${constraintResult.reason.message}`);
    }

    const sharedGoal = sharedGoalResult.value;
    const constraint = constraintResult.value;

    res.json({ sceneText, sharedGoal, constraint });

  } catch (error) {
    console.error("Scene generation error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// ===========================
//  POST /api/chaos
//  Generates a disruptive event that increases scene pressure.
// ===========================
app.post("/api/chaos", async (req, res) => {
  const { world, relationship, scene, constraint, sceneText } = req.body;

  const prompt = buildChaosPrompt({ world, relationship, scene, constraint, sceneText });

  try {
    const text = await callOpenAI(prompt, 500);
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

No dialogue. No names. Be brief.
`.trim();
}

function buildSharedGoalPrompt({ sceneText }) {
  return `
Write one sentence: a shared goal for a two-player dialogue game.

Scene: ${sceneText}

The goal must be a concrete action triggered through dialogue (e.g. someone apologizes, admits something, changes position). No vague emotions. No "they must talk."
`.trim();
}

function buildConstraintPrompt({ sceneText }) {
  return `
Write one sentence: a speaking constraint for a dialogue game.

Scene: ${sceneText}

The constraint must restrict HOW players speak, not what happens. Keep it simple and immediately usable (e.g. each line must start with "I never", certain words are banned, must speak indirectly).
`.trim();
}

function buildChaosPrompt({ sceneText }) {
  return `
You are generating a turning point in a dialogue game.

Current scene:
${sceneText}

Your goal is to CHANGE THE BALANCE between the two players.

Requirements:
- 1 sentence only
- No dialogue
- Must introduce new information, pressure, or consequence

Prefer:
- revealing a hidden fact
- shifting who is at fault
- introducing urgency
- changing power balance

Avoid:
- random events
- purely environmental changes
- resolving the conflict

The result should force players to rethink their strategy.

Write a turning point.
`.trim();
}

// ===========================
//  Start
// ===========================
app.listen(PORT, () => {
  console.log(`Scene Trap server running at http://localhost:${PORT}`);
});
