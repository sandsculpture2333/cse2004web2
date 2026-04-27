// ===========================
//  In-memory room store — PROTOTYPE ONLY
//
//  All routes import from this single file. To keep the Map shared under
//  `vercel dev` (which loads each api/*.js as a separate function bundle),
//  the routes are consolidated into a single api/room.js. With one
//  importer, this Map is guaranteed to be a single instance.
//
//  In production Vercel deployment, function instances may not persist
//  across cold starts. Replace this Map with Upstash Redis or similar
//  for production use.
// ===========================

const rooms = new Map();

function normalizeRoomId(id) {
  return typeof id === "string" ? id.trim().toUpperCase() : id;
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function logKeys(label, reqId) {
  const keys = Array.from(rooms.keys());
  console.log(`[rooms] ${label} req=${JSON.stringify(reqId)} keys=${JSON.stringify(keys)}`);
}

// --- Public API ---

export function createRoom({ playerId, playerName }) {
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

  rooms.set(roomId, room);
  console.log(`[rooms] createRoom new=${roomId} keys=${JSON.stringify(Array.from(rooms.keys()))}`);
  return room;
}

export function joinRoom({ roomId, playerId, playerName }) {
  const id = normalizeRoomId(roomId);
  logKeys("joinRoom", id);

  const room = rooms.get(id);
  if (!room) {
    console.log(`[rooms] joinRoom MISS for ${JSON.stringify(id)}`);
    return { error: "Room not found", status: 404 };
  }

  if (room.players.A?.id === playerId) {
    console.log(`[rooms] joinRoom HIT (rejoin A) ${id}`);
    return { room, playerRole: "A" };
  }
  if (room.players.B?.id === playerId) {
    console.log(`[rooms] joinRoom HIT (rejoin B) ${id}`);
    return { room, playerRole: "B" };
  }

  if (!room.players.B) {
    room.players.B = { id: playerId, name: playerName };
    room.status = "ready";
    console.log(`[rooms] joinRoom HIT (new B) ${id}`);
    return { room, playerRole: "B" };
  }

  console.log(`[rooms] joinRoom FULL ${id}`);
  return { error: "Room is full", status: 400 };
}

export function getRoom(roomId) {
  const id = normalizeRoomId(roomId);
  logKeys("getRoom", id);
  const room = rooms.get(id) || null;
  console.log(`[rooms] getRoom ${room ? "HIT" : "MISS"} ${id}`);
  return room;
}

export function endRoom({ roomId, playerId }) {
  const id = normalizeRoomId(roomId);
  const room = rooms.get(id);
  if (!room) {
    console.log(`[rooms] endRoom MISS ${id}`);
    return { error: "Room not found", status: 404 };
  }
  room.status = "ended";
  room.endedAt = Date.now();
  room.endedBy = playerId;
  console.log(`[rooms] endRoom ${id} by ${playerId}`);
  return { room };
}
