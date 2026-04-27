import { createRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { playerId, playerName } = req.body || {};
  if (!playerId || !playerName) {
    return res.status(400).json({ error: "Missing playerId or playerName" });
  }

  try {
    const room = await createRoom({ playerId, playerName });
    return res.json({ roomId: room.roomId, playerRole: "A", room });
  } catch (err) {
    console.error("[create-room]", err.message);
    return res.status(500).json({ error: "Failed to create room" });
  }
}
