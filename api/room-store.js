import { redis } from "./redis.js";

const ROOM_TTL = 60 * 60 * 2; // 2 hours

export function normalizeRoomId(id) {
  return typeof id === "string" ? id.trim().toUpperCase() : String(id);
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export async function createRoom({ playerId, playerName }) {
  const roomId = generateRoomCode();
  const room = {
    roomId,
    hostId: playerId,
    players: {
      A: { id: playerId, name: playerName },
      B: null,
    },
    status: "waiting",
    sceneText: "",
    sharedGoal: "",
    speakingConstraint: "",
    dialogueLines: [],
    chaosEvents: [],
    currentTurn: "A",
    createdAt: Date.now(),
  };
  await redis.set(`room:${roomId}`, room, { ex: ROOM_TTL });
  console.log(`[rooms] createRoom new=${roomId}`);
  return room;
}

export async function getRoom(roomId) {
  const id = normalizeRoomId(roomId);
  const room = await redis.get(`room:${id}`);
  if (!room) {
    console.log(`[rooms] getRoom MISS ${id}`);
    return null;
  }
  console.log(`[rooms] getRoom HIT ${id}`);
  return room;
}

// updater can be a plain object (merged) or a function (room) => updatedRoom
export async function updateRoom(roomId, updater) {
  const id = normalizeRoomId(roomId);
  const room = await getRoom(id);
  if (!room) return null;
  const updated = typeof updater === "function" ? updater(room) : { ...room, ...updater };
  await redis.set(`room:${id}`, updated, { ex: ROOM_TTL });
  return updated;
}

export async function endRoom(roomId, playerId) {
  return updateRoom(roomId, (room) => ({
    ...room,
    status: "ended",
    endedAt: Date.now(),
    endedBy: playerId,
  }));
}
