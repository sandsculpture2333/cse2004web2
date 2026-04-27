import { endRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { roomId, playerId } = req.body || {};
  if (!roomId || !playerId) {
    return res.status(400).json({ error: "Missing roomId or playerId" });
  }

  try {
    const room = await endRoom(roomId, playerId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    return res.json({ room });
  } catch (err) {
    console.error("[end-room]", err.message);
    return res.status(500).json({ error: "Failed to end room" });
  }
}
