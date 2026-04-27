// ===========================
//  POST /api/generate
//  Vercel serverless function.
//  OPENAI_API_KEY must be set in Vercel Environment Variables.
//
//  Supports two modes:
//  - Local/solo: body = { world, relationship, scene }
//  - Room mode:  body = { world, relationship, scene, roomId, playerId }
//    In room mode the generated content is saved into the shared room
//    state so the second player sees it on their next poll.
// ===========================

import {
  callOpenAI,
  buildScenePrompt,
  buildFallbackScenePrompt,
  buildSharedGoalPrompt,
  buildConstraintPrompt,
} from "./_lib/openai.js";
import { getRoom, updateRoom } from "./room-store.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { world, relationship, scene, roomId, playerId } = req.body;

  if (!world || !relationship || !scene) {
    return res.status(400).json({ error: "Missing one or more required fields." });
  }

  // --- Room mode: validate host before spending AI tokens ---
  if (roomId) {
    const room = await getRoom(roomId);
    if (!room) return res.status(404).json({ error: "Room not found" });
    if (room.players.A?.id !== playerId) {
      return res.status(403).json({ error: "Only the host can generate the scene." });
    }
  }

  try {
    // Step 1: generate scene setup; retry once with shorter prompt if truncated
    let sceneText;
    try {
      sceneText = await callOpenAI(buildScenePrompt({ world, relationship, scene }), 2000);
    } catch (sceneError) {
      if (sceneError.message.includes("incomplete") && sceneError.message.includes("max_output_tokens")) {
        console.warn("Scene truncated — retrying with fallback prompt");
        try {
          sceneText = await callOpenAI(buildFallbackScenePrompt({ world, relationship, scene }), 2000);
        } catch (fallbackError) {
          throw new Error(`Scene setup generation failed: ${fallbackError.message}`);
        }
      } else {
        throw new Error(`Scene setup generation failed: ${sceneError.message}`);
      }
    }

    // Step 2 & 3: generate shared goal and constraint in parallel
    const [sharedGoalResult, constraintResult] = await Promise.allSettled([
      callOpenAI(buildSharedGoalPrompt({ sceneText }), 500),
      callOpenAI(buildConstraintPrompt({ sceneText }), 500),
    ]);

    if (sharedGoalResult.status === "rejected") {
      throw new Error(`Shared goal generation failed: ${sharedGoalResult.reason.message}`);
    }
    if (constraintResult.status === "rejected") {
      throw new Error(`Speaking constraint generation failed: ${constraintResult.reason.message}`);
    }

    const sharedGoal = sharedGoalResult.value;
    const constraint = constraintResult.value;

    // --- Room mode: persist to shared state ---
    if (roomId) {
      const updatedRoom = await updateRoom(roomId, (r) => ({
        ...r,
        sceneText,
        sharedGoal,
        speakingConstraint: constraint,
        world,
        relationship,
        scene,
        status: "playing",
        dialogueLines: [],
        chaosEvents: [],
        currentTurn: "A",
      }));
      return res.json({ sceneText, sharedGoal, constraint, room: updatedRoom });
    }

    // --- Solo/local mode ---
    return res.json({ sceneText, sharedGoal, constraint });

  } catch (error) {
    console.error("Scene generation error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
