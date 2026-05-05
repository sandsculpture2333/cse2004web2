import { getRoom, updateRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { roomId, playerId, hostTakesFirst } = req.body || {};
  if (!roomId || !playerId) {
    return res.status(400).json({ error: "Missing roomId or playerId" });
  }

  try {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.players.A?.id !== playerId) {
      return res.status(403).json({ error: "Only the host can assign roles" });
    }
    if (!room.roleAssignmentPending) {
      return res.status(400).json({ error: "Role assignment already complete" });
    }

    const [roleA, roleB] = room.roleOptions || ["Character A", "Character B"];
    const sceneRoles = hostTakesFirst
      ? { A: roleA, B: roleB }
      : { A: roleB, B: roleA };

    const updated = await updateRoom(roomId, { sceneRoles, roleAssignmentPending: false });
    return res.json({ sceneRoles, room: updated });
  } catch (err) {
    console.error("[assign-roles]", err.message);
    return res.status(500).json({ error: "Failed to assign roles" });
  }
}
