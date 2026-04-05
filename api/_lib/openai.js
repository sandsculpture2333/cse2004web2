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

export function buildChaosPrompt({ sceneText }) {
  return `
You are generating a turning point in a dialogue game.

Current scene:
${sceneText}

Your goal is to CHANGE THE BALANCE between the two players.

Requirements:
- 1 sentence only
- No dialogue
- Must introduce new information, pressure, or consequence

Prefer:
- revealing a hidden fact
- shifting who is at fault
- introducing urgency
- changing power balance

Avoid:
- random events
- purely environmental changes
- resolving the conflict

The result should force players to rethink their strategy.

Write a turning point.
`.trim();
}
