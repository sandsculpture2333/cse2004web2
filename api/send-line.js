import { getRoom, updateRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

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

    // Identify which player is sending
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
    return res.status(500).json({ error: "Failed to send line" });
  }
}
