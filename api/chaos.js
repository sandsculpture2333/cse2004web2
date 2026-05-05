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

  return callOpenAI(prompt, 1500);
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

    // Eligibility checks (fast path before spending AI tokens)
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

    // Remember the event count before generation so the updater can detect a concurrent trigger
    const initialEventsCount = events.length;

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

      // Re-validate inside the updater against the freshest room state to prevent
      // a concurrent request from appending a duplicate while this one was generating.
      const updatedRoom = await updateRoom(roomId, (r) => {
        const fresh = r.chaosEvents || [];
        if (fresh.length > initialEventsCount) return r; // someone else already appended
        if (fresh.length >= MAX_CHAOS_EVENTS)  return r; // hit cap concurrently
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
}
