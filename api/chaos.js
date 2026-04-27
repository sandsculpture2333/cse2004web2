// ===========================
//  POST /api/chaos
//  Vercel serverless function.
//  OPENAI_API_KEY must be set in Vercel Environment Variables.
//
//  Supports two modes:
//  - Local/solo: body = { world, relationship, scene, constraint, sceneText }
//  - Room mode:  body = { roomId, playerId }
//    Room mode enforces pacing rules and saves to shared state.
// ===========================

import { callOpenAI, buildChaosPrompt } from "./_lib/openai.js";
import { getRoom, updateRoom } from "./room-store.js";

const MAX_CHAOS_EVENTS  = 5;
const LINES_BETWEEN     = 10;

async function generateChaos(room, retryShort = false) {
  const recentLines = (room.dialogueLines || []).slice(-8);
  const prevChaos   = (room.chaosEvents   || []).slice(-2);

  // On retry, drop dialogue context to reduce tokens
  const prompt = buildChaosPrompt({
    sceneText:          room.sceneText,
    sharedGoal:         room.sharedGoal,
    speakingConstraint: room.speakingConstraint,
    recentLines:        retryShort ? [] : recentLines,
    previousChaosEvents: prevChaos,
  });

  return callOpenAI(prompt, retryShort ? 250 : 350);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomId, playerId, world, relationship, scene, constraint, sceneText } = req.body;

  // --- Room mode ---
  if (roomId) {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    const isPlayerA = room.players.A?.id === playerId;
    const isPlayerB = room.players.B?.id === playerId;
    if (!isPlayerA && !isPlayerB) {
      return res.status(403).json({ error: "Player not in this room" });
    }

    const events  = room.chaosEvents   || [];
    const lines   = room.dialogueLines || [];

    // Eligibility checks
    if (events.length >= MAX_CHAOS_EVENTS) {
      return res.status(400).json({ error: "Maximum chaos events reached for this round." });
    }
    if (events.length === 0) {
      if (lines.length < LINES_BETWEEN) {
        return res.status(400).json({ error: "Chaos is not ready yet. Let the scene develop first." });
      }
    } else {
      const lastChaos = events[events.length - 1];
      if (lines.length - lastChaos.lineCountAtTrigger < LINES_BETWEEN) {
        return res.status(400).json({ error: "Chaos is not ready yet. Let the scene develop first." });
      }
    }

    try {
      let text;
      try {
        text = await generateChaos(room, false);
      } catch (err) {
        if (err.message.includes("incomplete")) {
          text = await generateChaos(room, true);
        } else {
          throw err;
        }
      }

      const event = {
        id:                 Date.now().toString(),
        text,
        triggeredBy:        isPlayerA ? "A" : "B",
        createdAt:          Date.now(),
        lineCountAtTrigger: lines.length,
      };

      const updatedRoom = await updateRoom(roomId, (r) => ({
        ...r,
        chaosEvents: [...(r.chaosEvents || []), event],
      }));

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
      350
    );
    res.json({ text });
  } catch (error) {
    console.error("Chaos generation error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
