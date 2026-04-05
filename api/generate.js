// ===========================
//  POST /api/generate
//  Vercel serverless function.
//  OPENAI_API_KEY must be set in Vercel Environment Variables.
// ===========================

import {
  callOpenAI,
  buildScenePrompt,
  buildFallbackScenePrompt,
  buildSharedGoalPrompt,
  buildConstraintPrompt,
} from "./_lib/openai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { world, relationship, scene } = req.body;

  if (!world || !relationship || !scene) {
    return res.status(400).json({ error: "Missing one or more required fields." });
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

    res.json({
      sceneText,
      sharedGoal: sharedGoalResult.value,
      constraint: constraintResult.value,
    });

  } catch (error) {
    console.error("Scene generation error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
