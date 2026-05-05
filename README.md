# Scene Trap

Scene Trap is a two-player improv dialogue game. Two players generate a dramatic scene, take turns speaking in character, follow a speaking constraint, and work toward a shared objective. A chaos event can shift the balance mid-scene.

Players can play in the same room or remotely via a shared room code.

## How to Play

1. **Enter a name** and create or join a room with a 4-character code.
2. **Build the scene** — the host picks a world, relationship, and scene type, then clicks "Enter the Scene." The AI generates a setup, objective, speaking rule, and completion trigger for both players.
3. **Take turns speaking** — only the current player can add a line. Type in character and click Speak.
4. **Trigger Chaos** — after every 10 lines, inject an external disruption that shifts the scene's balance. Up to 5 chaos events per scene.
5. **End the scene** — use Check Ending to ask the AI whether the completion trigger has been met, or End Manually to close the scene immediately.

## Features

- AI-generated scene setup, objective, speaking rule, completion trigger, and character roles
- Remote two-player mode via shared room code (Upstash Redis-backed)
- Turn-based dialogue with server-enforced turn order
- Chaos events: AI-generated disruptions with pacing rules
- AI ending check with 15-second cooldown
- Role assignment: random or host-chosen
- Voice input (Web Speech API)
- Browser notifications for chaos events
- Session persistence via localStorage (reconnect after refresh)

## File Structure

```
index.html          — page structure and UI
styles.css          — styling
app.js              — frontend logic (lobby, polling, dialogue, chaos, rooms)
server.js           — Express server for local development (npm run dev)
api/
  generate.js       — AI scene generation
  chaos.js          — AI chaos event generation
  check-ending.js   — AI ending check
  assign-roles.js   — role assignment for room mode
  create-room.js    — create a room in Redis
  join-room.js      — join an existing room
  get-room.js       — poll room state
  send-line.js      — submit a dialogue line
  retract-line.js   — remove the most recent line
  end-room.js       — end a room session
  room-store.js     — shared Redis room helpers
  redis.js          — Upstash Redis client
  _lib/
    openai.js       — OpenAI API helper and all prompt builders
```

## Tech Stack

- **Frontend**: plain HTML / CSS / JavaScript
- **Backend**: Vercel serverless functions (ESM)
- **AI**: OpenAI API (`gpt-5-mini` with low-effort reasoning)
- **Room state**: Upstash Redis (2-hour TTL per room)
- **Browser APIs**: Web Speech API, Notifications API

## Local Development

```bash
npm install
# Create .env.local with OPENAI_API_KEY, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
npm run dev
# Open http://localhost:3000
```

For Vercel deployment, set the same environment variables in the Vercel dashboard.

## Concept

Scene Trap is not a story generator. It is a dialogue game system. Each round is built from four layers:

- **Scene** — the backstory and why these two characters must face each other now
- **Objective** — the specific thing that must happen through dialogue for the scene to be complete
- **Speaking Rule** — a constraint on how players must speak, creating friction
- **Chaos** — an external disruption that shifts who is at fault or changes what can be argued
