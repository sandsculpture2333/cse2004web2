// ===========================
//  POST /api/check-ending
//  Vercel serverless function.
//  Judges whether the scene's completion trigger has been met.
//  Returns { completed, reason, room }.
//  Sets room.status = "complete" only when completed is true.
// ===========================

import { callOpenAI, buildEndingCheckPrompt } from "./_lib/openai.js";
import { getRoom, updateRoom } from "./room-store.js";

const COOLDOWN_MS = 15_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomId, playerId } = req.body;
  if (!roomId || !playerId) {
    return res.status(400).json({ error: "Missing roomId or playerId" });
  }

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
  if (room.lastEndingCheckAt && Date.now() - room.lastEndingCheckAt < COOLDOWN_MS) {
    const waitSecs = Math.ceil((COOLDOWN_MS - (Date.now() - room.lastEndingCheckAt)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSecs}s before checking again.` });
  }

  try {
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

  } catch (error) {
    console.error("Check ending error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
