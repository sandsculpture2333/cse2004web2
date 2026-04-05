# Scene Trap

Scene Trap is a two-player improv dialogue game prototype built as a single-page web app.

Players generate a dramatic setup, take turns speaking in character, follow a speaking constraint, and try to trigger a shared goal. A chaos event can shift the balance of the scene mid-game.

## Features

- AI-generated scene setup
- AI-generated shared goal
- AI-generated speaking constraint
- AI-generated chaos event
- Local two-player play
- Voice input (speech-to-text)
- Claim Completion / Report Violation interaction
- Compact in-page help panel

## Built With

### Browser APIs
- Web Speech API (speech recognition / voice input)
- Notifications API

### Data API
- OpenAI API

## File Structure

- `index.html` — page structure
- `styles.css` — styling
- `app.js` — frontend interaction logic
- `api/generate.js` — AI generation route
- `api/chaos.js` — chaos generation route

## Concept

Scene Trap is not a story generator. It is a dialogue game system.

Each round is built from four layers:

- Scene — why the two players must talk now
- Shared Goal — what must happen in the conversation
- Speaking Constraint — how the players must speak
- Chaos — what shifts the balance mid-scene

The goal is to create a playable dramatic situation rather than a finished narrative.