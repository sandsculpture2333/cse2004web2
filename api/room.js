// ===========================
//  /api/room — single-file room handler
//
//  Consolidated into one route so the in-memory Map in _lib/rooms.js
//  is shared across all three behaviors. Under `vercel dev`, each
//  api/*.js file is its own function bundle with its own module
//  cache; splitting create/join/get across separate files would give
//  each one a separate empty Map.
//
//  Dispatch:
//    GET  /api/room?roomId=XXXX                     → get state
//    POST /api/room  body { action: "create", ... } → create room
//    POST /api/room  body { action: "join",   ... } → join room
// ===========================

import { createRoom, joinRoom, getRoom, endRoom } from "./_lib/rooms.js";

export default function handler(req, res) {
  if (req.method === "GET") {
    const { roomId } = req.query;
    console.log(`[room] GET roomId=${JSON.stringify(roomId)}`);
    if (!roomId) return res.status(400).json({ error: "Missing roomId" });
    const room = getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    return res.json({ room });
  }

  if (req.method === "POST") {
    const { action } = req.body || {};
    console.log(`[room] POST action=${JSON.stringify(action)} body=${JSON.stringify(req.body)}`);

    if (action === "create") {
      const { playerId, playerName } = req.body;
      if (!playerId || !playerName) {
        return res.status(400).json({ error: "Missing playerId or playerName" });
      }
      const room = createRoom({ playerId, playerName });
      return res.json({ roomId: room.roomId, playerRole: "A", room });
    }

    if (action === "join") {
      const { roomId, playerId, playerName } = req.body;
      if (!roomId || !playerId || !playerName) {
        return res.status(400).json({ error: "Missing roomId, playerId, or playerName" });
      }
      const result = joinRoom({ roomId, playerId, playerName });
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.json({
        roomId: result.room.roomId,
        playerRole: result.playerRole,
        room: result.room,
      });
    }

    if (action === "end") {
      const { roomId, playerId } = req.body;
      if (!roomId || !playerId) {
        return res.status(400).json({ error: "Missing roomId or playerId" });
      }
      const result = endRoom({ roomId, playerId });
      if (result.error) return res.status(result.status).json({ error: result.error });
      return res.json({ room: result.room });
    }

    return res.status(400).json({ error: "Unknown action: " + action });
  }

  return res.status(405).json({ error: "Method not allowed" });
}
