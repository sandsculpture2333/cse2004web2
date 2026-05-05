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
  buildTriggerPrompt,
  buildRolesPrompt,
  parseRoles,
} from "./_lib/openai.js";
import { getRoom, updateRoom } from "./room-store.js";

const GENERATE_COOLDOWN_MS = 30_000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { world, relationship, scene, roomId, playerId, assignmentMode = "random" } = req.body;

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
    if (room.lastGenerateAt && Date.now() - room.lastGenerateAt < GENERATE_COOLDOWN_MS) {
      const waitSecs = Math.ceil((GENERATE_COOLDOWN_MS - (Date.now() - room.lastGenerateAt)) / 1000);
      return res.status(429).json({ error: `Scene was just generated. Please wait ${waitSecs}s.` });
    }
  }

  try {
    // Step 1: generate scene setup; retry once with shorter prompt if truncated
    let sceneText;
    try {
      sceneText = await callOpenAI(buildScenePrompt({ world, relationship, scene }), 4000);
    } catch (sceneError) {
      if (sceneError.message.includes("incomplete") && sceneError.message.includes("max_output_tokens")) {
        console.warn("Scene truncated — retrying with fallback prompt");
        try {
          sceneText = await callOpenAI(buildFallbackScenePrompt({ world, relationship, scene }), 4000);
        } catch (fallbackError) {
          throw new Error(`Scene setup generation failed: ${fallbackError.message}`);
        }
      } else {
        throw new Error(`Scene setup generation failed: ${sceneError.message}`);
      }
    }

    // Step 2: generate shared goal — constraint and trigger both need it
    const sharedGoal = await callOpenAI(buildSharedGoalPrompt({ sceneText }), 1500);

    // Step 3, 4, 5: generate constraint, trigger, and roles in parallel
    const [constraintResult, triggerResult, rolesResult] = await Promise.allSettled([
      callOpenAI(buildConstraintPrompt({ sceneText, sharedGoal }), 1500),
      callOpenAI(buildTriggerPrompt({ sceneText, sharedGoal }), 1000),
      roomId ? callOpenAI(buildRolesPrompt({ sceneText }), 1000) : Promise.resolve(""),
    ]);

    if (constraintResult.status === "rejected") {
      throw new Error(`Speaking constraint generation failed: ${constraintResult.reason.message}`);
    }

    const constraint = constraintResult.value;
    let triggerDefinition = "";
    if (triggerResult.status === "fulfilled") {
      triggerDefinition = triggerResult.value;
    } else {
      console.warn("Trigger definition generation failed (non-fatal):", triggerResult.reason.message);
    }

    // Parse role options (only relevant in room mode)
    let roleOptions = ["Character A", "Character B"];
    if (roomId) {
      if (rolesResult.status === "fulfilled" && rolesResult.value) {
        roleOptions = parseRoles(rolesResult.value);
      } else if (rolesResult.status === "rejected") {
        console.warn("Role generation failed (non-fatal):", rolesResult.reason?.message);
      }
    }

    // --- Room mode: persist to shared state ---
    if (roomId) {
      // Determine role assignment
      let sceneRoles, roleAssignmentPending;
      if (assignmentMode === "host") {
        sceneRoles = { A: null, B: null };
        roleAssignmentPending = true;
      } else {
        // Random: flip a coin to decide which player gets which role
        const flip = Math.random() < 0.5;
        sceneRoles = {
          A: flip ? roleOptions[1] : roleOptions[0],
          B: flip ? roleOptions[0] : roleOptions[1],
        };
        roleAssignmentPending = false;
      }

      const updatedRoom = await updateRoom(roomId, (r) => ({
        ...r,
        sceneText,
        sharedGoal,
        speakingConstraint: constraint,
        triggerDefinition,
        world,
        relationship,
        scene,
        status: "playing",
        dialogueLines: [],
        chaosEvents: [],
        currentTurn: "A",
        roleOptions,
        sceneRoles,
        roleAssignmentPending,
        lastGenerateAt: Date.now(),
      }));
      if (!updatedRoom) return res.status(404).json({ error: "Room not found — it may have expired. Please create a new room." });
      return res.json({ sceneText, sharedGoal, constraint, triggerDefinition, roleOptions, sceneRoles, roleAssignmentPending, room: updatedRoom });
    }

    // --- Solo/local mode ---
    return res.json({ sceneText, sharedGoal, constraint, triggerDefinition });

  } catch (error) {
    console.error("Scene generation error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
