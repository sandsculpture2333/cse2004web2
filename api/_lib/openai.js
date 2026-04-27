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

No dialogue. No names. Be brief.
`.trim();
}

export function buildSharedGoalPrompt({ sceneText }) {
  return `
Write one sentence: a shared goal for a two-player dialogue game.

Scene: ${sceneText}

The goal must be a concrete action triggered through dialogue (e.g. someone apologizes, admits something, changes position). No vague emotions. No "they must talk."
`.trim();
}

export function buildConstraintPrompt({ sceneText }) {
  return `
Write one sentence: a speaking constraint for a dialogue game.

Scene: ${sceneText}

The constraint must restrict HOW players speak, not what happens. Keep it simple and immediately usable (e.g. each line must start with "I never", certain words are banned, must speak indirectly).
`.trim();
}

export function buildChaosPrompt({ sceneText, sharedGoal, speakingConstraint, recentLines, previousChaosEvents }) {
  const lineBlock = recentLines && recentLines.length > 0
    ? `\nRecent dialogue:\n${recentLines.map((l) => `${l.playerRole}: ${l.text}`).join("\n")}`
    : "";

  const chaosBlock = previousChaosEvents && previousChaosEvents.length > 0
    ? `\nPrevious chaos:\n${previousChaosEvents.map((e, i) => `${i + 1}. ${e.text}`).join("\n")}`
    : "";

  return `
You are generating an escalating turning point in a dialogue game.

Scene: ${sceneText}
Goal: ${sharedGoal || "unresolved conflict"}
Constraint: ${speakingConstraint || "none"}${lineBlock}${chaosBlock}

Rules:
- Exactly 1 sentence, max 30 words
- No dialogue
- Must shift emotional, moral, or strategic balance
- If previous chaos exists, escalate or reveal a consequence — do not contradict it
- Do not resolve the conflict

Prefer revealing hidden facts, shifting fault, introducing urgency, or changing power balance.

Write the turning point.
`.trim();
}
