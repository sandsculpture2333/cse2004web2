// ===========================
//  Shared OpenAI helper
//  OPENAI_API_KEY must be set in Vercel Environment Variables.
// ===========================

export async function callOpenAI(prompt, maxTokens) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-5-mini",
      input: prompt,
      max_output_tokens: maxTokens,
      reasoning: { effort: "low" },
      text: { format: { type: "text" }, verbosity: "low" },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("OpenAI raw error:", response.status, body);
    throw new Error(`OpenAI ${response.status}: ${body}`);
  }

  const data = await response.json();

  if (data.status === "incomplete") {
    const reason = data.incomplete_details?.reason ?? "unknown";
    throw new Error(`OpenAI response incomplete (reason: ${reason})`);
  }

  if (data.output_text) {
    return data.output_text.trim();
  }

  const messageItem = data.output?.find((item) => item.type === "message");
  const textItem = messageItem?.content?.find((c) => c.type === "output_text");

  if (!textItem?.text) {
    throw new Error("No text in OpenAI response: " + JSON.stringify(data));
  }

  return textItem.text.trim();
}

// ===========================
//  Prompt Builders
// ===========================

export function buildScenePrompt({ world, relationship, scene }) {
  return `
Write a 2–3 sentence opening setup for a two-player dialogue game.

World: ${world}
Relationship: ${relationship}
Situation: ${scene}

Must include:
- one specific past event between them
- the consequence of that event
- why they must face each other now

Rules:
- no dialogue
- no names
- no resolution
- keep it concrete and playable
- focus on conflict, not decorative description
- write in third person — never use "you" or "your"; refer to the characters by their role (e.g. "the heir", "the architect", "the mentor", "the investigator")
- this is a shared document for both players, not addressed to one
`.trim();
}

export function buildFallbackScenePrompt({ world, relationship, scene }) {
  return `
Write 2 short sentences for a dialogue game.

World: ${world}
Relationship: ${relationship}
Situation: ${scene}

Include:
- one past conflict
- one consequence
- why they must talk now

No dialogue. No names. Be brief. Write in third person — no "you" or "your". Refer to characters by role.
`.trim();
}

export function buildSharedGoalPrompt({ sceneText }) {
  return `
Write one sentence (max 25 words): the objective for a two-player dialogue game.

Scene: ${sceneText}

State the specific action that must happen through dialogue for the scene to be complete. Be concrete and action-based. No vague emotions. No "they must understand each other." Write in third person — no "you" or "your".
`.trim();
}

export function buildConstraintPrompt({ sceneText, sharedGoal }) {
  const goalLine = sharedGoal ? `\nObjective: ${sharedGoal}` : "";
  return `
Write one sentence (max 25 words): a speaking rule for a two-player dialogue game.

Scene: ${sceneText}${goalLine}

The rule must create friction — shaping how players argue, accuse, or reveal. Keep it short and immediately memorable.

Use one of these types:
- Forbidden word or topic (e.g. "players may not name the event directly until one has asked a question")
- Required move (e.g. "each player must ask a question before making an accusation")
- Restraint (e.g. "neither player may issue a direct threat")

Do NOT write fixed opening phrases, literary constraints, or rules that make every line sound identical. Write in third person — no "you" or "your". Refer to "players" or by role.
`.trim();
}

export function buildTriggerPrompt({ sceneText, sharedGoal }) {
  return `
Write one sentence (max 30 words): a completion trigger for a two-player dialogue game.

Scene: ${sceneText}
Objective: ${sharedGoal}

Describe observable transcript evidence — what a player must say or admit for the scene to count as complete. Be specific and conservative. Write in third person — no "you" or "your". Start with "The scene is complete when…"
`.trim();
}

export function buildRolesPrompt({ sceneText }) {
  return `
Write two character role labels for a two-player dialogue game.

Scene: ${sceneText}

Each label should be 1–4 words: a title, relational identity, or role name that fits the scene (e.g. "The Architect", "Estranged Heir", "Crime Analyst", "Informant", "Former Favored Disciple").
They should feel like positions or roles, not character names.

Output exactly two lines:
Line 1: role label for the first character
Line 2: role label for the second character

No numbering. No bullet points. No punctuation at the start. No explanation.
`.trim();
}

export function parseRoles(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  return [lines[0] || "Character A", lines[1] || "Character B"];
}

export function buildEndingCheckPrompt(room) {
  const lines = (room.dialogueLines || [])
    .map((l) => `${l.playerRole}: ${l.text}`)
    .join("\n");

  const recentChaos = (room.chaosEvents || [])
    .slice(-2)
    .map((e) => e.text)
    .join("; ");
  const chaosLine = recentChaos ? `\nChaos events: ${recentChaos}` : "";

  return `
You are judging a two-player dialogue game.

Objective: ${room.sharedGoal}
Completion trigger: ${room.triggerDefinition}${chaosLine}

Transcript:
${lines}

Has the completion trigger been met? Look only for a clear transcript line where a player explicitly says or admits what the trigger requires. Do not infer hidden feelings or intent. If uncertain, return false.

Respond with strict JSON only — no explanation outside the JSON:
{"completed": true, "reason": "one short sentence"}
or
{"completed": false, "reason": "one short sentence"}
`.trim();
}

export function buildChaosPrompt({ sceneText, sharedGoal, speakingConstraint, recentLines, previousChaosEvents }) {
  const lineBlock = recentLines && recentLines.length > 0
    ? `\nRecent dialogue:\n${recentLines.map((l) => `${l.playerRole}: ${l.text}`).join("\n")}`
    : "";

  const chaosBlock = previousChaosEvents && previousChaosEvents.length > 0
    ? `\nPrior chaos (do NOT repeat or rephrase these — write a new consequence or escalation):\n${previousChaosEvents.map((e, i) => `${i + 1}. ${e.text}`).join("\n")}`
    : "";

  const constraintNote = speakingConstraint
    ? `\nPlayer speaking rule (for players only — chaos must NOT follow this rule or imitate this style): ${speakingConstraint}`
    : "";

  return `
You are generating an external turning point in a two-player dialogue game.

Scene: ${sceneText}
Goal: ${sharedGoal || "unresolved conflict"}${constraintNote}${lineBlock}${chaosBlock}

WHAT CHAOS IS:
An external fact, document, consequence, or discovery that shifts the moral, emotional, or strategic balance between the two players. It is not spoken by either player. It does not follow any speaking rule.

WHAT CHAOS IS NOT:
- Not dialogue or words spoken by a character
- Not narration in a character's voice
- Not a thought or feeling expressed by either player
- Not a line that starts with or imitates the player speaking rule above

GOOD EXAMPLE:
"An email timestamp proves the transfer was signed hours before the claimed emergency, making the original explanation impossible."

BAD EXAMPLE (do NOT write this):
"If I had known you signed it without my consent, I would have acted differently." — This is player dialogue and imitates a speaking rule.

Requirements:
- Exactly 1 sentence, maximum 35 words
- Must reveal new evidence, shift who seems responsible, or introduce a contradiction, document, or third-party action that gives players new things to argue about
- Avoid: only adding a deadline or time pressure without revealing new information
- If prior chaos exists, escalate or complicate it — do not repeat the same type of event
- Do not resolve the conflict

Prefer: evidence (timestamps, recordings, documents, witnesses), hidden facts, or third-party actions that change what can be argued.

Write the external turning point now.
`.trim();
}
