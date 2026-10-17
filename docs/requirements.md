# Full-Stack Technical Assessment — AI Design Brief Assistant

**Role:** Senior Full-Stack Engineer
**Time budget:** 3–5 days
**Submit to:** [TO FILL — email / Slack handle]

---

## Overview

Build a web application where automotive designers create projects and chat with an AI assistant about design direction, colour-material-finish (CMF) themes, and material choices. The AI is aware of the project's context and helps designers think through options and summarise decisions.

This is a realistic slice of the product you would ship in your first weeks at lmesh.

---

## AI Provider (Free — Your Choice)

You must integrate a real LLM. Use whichever free option suits you:

| Provider          | How to get access                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Ollama**        | `brew install ollama && ollama pull llama3.2` — fully local, no account needed                                              |
| **OpenRouter**    | [openrouter.ai](https://openrouter.ai) — free API key, free models available (e.g. `meta-llama/llama-3.1-8b-instruct:free`) |
| **Google Gemini** | [aistudio.google.com](https://aistudio.google.com) — free API key, `gemini-2.0-flash-lite` is free with no credit card      |

The AI must genuinely respond. A hardcoded or mocked response does not count.

---

## Stack

- **Backend:** NestJS 11 (Fastify adapter), TypeScript, Prisma, PostgreSQL, Docker
- **Frontend:** React 19, TanStack Router v1, TanStack Query, Zustand, Tailwind CSS v4, shadcn/ui

This is the baseline. Any additional libraries or tools beyond it are your choice.

Scaffold both services from scratch.

---

## What to Build

### Core user flow

1. A user logs in.
2. They create a **design project** with a title and an optional description of the design context (e.g. "warm earth tones, matte leather, premium SUV interior").
3. Inside a project, they can **chat with an AI assistant** that is aware of the project's context. The AI responds to questions about design direction, materials, and finish options.
4. They can ask the AI to **summarise the key design decisions** made during the conversation.
5. They can **reset the conversation** and start fresh without losing the project itself.

### What the experience should feel like

- The AI response should **appear progressively** as it is generated — not all at once after a delay.
- The app should handle the case where the AI takes time to respond or fails.
- Navigating between projects should feel fast.

### Authentication

- Login with email and password. A seed user is sufficient — no registration flow needed.
- All features require the user to be logged in.

### Infrastructure

- The full application must start with a single command using Docker Compose.
- A seed script must populate sample data so the reviewer can explore the app immediately.
- Environment variables must be documented in a `.env.example` file.

---

## Deliverables

- [ ] Git repository (public GitHub or shared link) with a readable commit history
- [ ] `README.md` — how to set up, start, and use the app; which AI provider you chose and why
- [ ] `DECISIONS.md` — answers to the architecture questions below (required, not optional)
- [ ] The app runs end-to-end from `docker compose up` + seed
- [ ] Unit tests (at least 3) covering the logic paths you consider most critical
- [ ] Seed script creates a working user with credentials documented in the README (e.g. `test@lmesh.eu / password`)

---

## Architecture Decision Record (Required)

Include a `DECISIONS.md` in the root of your repository. This is not optional — submissions without it are incomplete.

Answer each question in 3–8 sentences. Be specific: reference actual file paths, module names, or patterns from your code.

**1. AI integration**
How did you structure the AI integration? What would need to change to swap the provider? How did you handle the case where the AI returns an unexpected or malformed response?

**2. Streaming**
How does the progressive response experience work end-to-end — from the backend generating tokens to the user seeing them appear? What trade-offs did you consider?

**3. Conversation context**
How does the AI know about the project's design context? How do you manage how much conversation history you send to the AI on each call?

**4. State management**
Walk through one specific decision about what state lives where (server state vs. client state). Why did you put it there?

**5. What you would do differently**
If you had two more days, what specific thing would you refactor or add — and why did you not do it in the time given?

---

## Conventions to Follow

These mirror lmesh's internal standards:

- **Files:** `kebab-case.type.ts` — e.g. `design-project.service.ts`
- **Classes:** `PascalCase`
- **Methods/variables:** `camelCase`
- **Routes:** plural, kebab-case — e.g. `/api/v1/projects`
- **Success responses:** `{ data: T, message?: string, code?: string }`
- **Error responses:** `{ message: string, code: ErrorCode, errors?: Record<string, string[]> }`
- **Exceptions:** only from `common/exceptions/` — never `throw new Error()` or raw `HttpException`
- **Logging:** `private readonly logger = new Logger(ClassName.name)`
- **TSDoc:** on all `public` methods
- **Commits:** conventional commits — `feat:`, `fix:`, `chore:`, `refactor:`, etc.
- **Swagger:** document all endpoints at `/api/docs`
