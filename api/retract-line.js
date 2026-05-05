// ===========================
//  POST /api/retract-line
//  Vercel serverless function.
//  Removes the most recent dialogue line and restores the turn.
// ===========================

import { getRoom, updateRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomId, playerId } = req.body;
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
      if (lines.length === 0) return r; // concurrent guard
      const retracted = lines[lines.length - 1];
      return {
        ...r,
        dialogueLines: lines.slice(0, -1),
        currentTurn: retracted.playerRole, // restore turn to who sent the removed line
      };
    });

    return res.json({ room: updatedRoom });
  } catch (error) {
    console.error("Retract line error:", error.message);
    return res.status(500).json({ error: "Failed to retract line." });
  }
}
