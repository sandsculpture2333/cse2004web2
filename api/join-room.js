import { getRoom, updateRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { roomId, playerId, playerName } = req.body || {};
  if (!roomId || !playerId || !playerName) {
    return res.status(400).json({ error: "Missing roomId, playerId, or playerName" });
  }

  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });

    // Rejoin as Player A
    if (room.players.A?.id === playerId) {
      return res.json({ roomId: room.roomId, playerRole: "A", room });
    }
    // Rejoin as Player B
    if (room.players.B?.id === playerId) {
      return res.json({ roomId: room.roomId, playerRole: "B", room });
    }
    // Assign the open Player B slot
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
    return res.status(500).json({ error: "Failed to join room" });
  }
}
