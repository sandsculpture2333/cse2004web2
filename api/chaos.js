// ===========================
//  POST /api/chaos
//  Vercel serverless function.
//  OPENAI_API_KEY must be set in Vercel Environment Variables.
// ===========================

import { callOpenAI, buildChaosPrompt } from "./_lib/openai.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { world, relationship, scene, constraint, sceneText } = req.body;

  try {
    const text = await callOpenAI(
      buildChaosPrompt({ world, relationship, scene, constraint, sceneText }),
      500
    );
    res.json({ text });
  } catch (error) {
    console.error("Chaos generation error:", error.message);
    res.status(500).json({ error: error.message });
  }
}
