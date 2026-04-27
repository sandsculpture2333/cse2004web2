import { getRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { roomId } = req.query;
  if (!roomId) return res.status(400).json({ error: "Missing roomId" });

  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    return res.json({ room });
  } catch (err) {
    console.error("[get-room]", err.message);
    return res.status(500).json({ error: "Failed to get room" });
  }
}
