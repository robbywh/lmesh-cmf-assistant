# Architecture Decisions

Answers to the five architecture questions in [`docs/requirements.md`](docs/requirements.md). Paths are relative to the repository root.

---

## 1. AI integration

### How did you structure the AI integration?

I used the **Adapter pattern**. The chat code depends on one interface, `AiProvider` ([`apps/backend/src/ai/ai-provider.interface.ts`](apps/backend/src/ai/ai-provider.interface.ts)), with one main method: `streamChat(messages, { signal })`, which returns the answer as a stream of text pieces.

Each provider has its own adapter:

- [`openrouter-ai.provider.ts`](apps/backend/src/ai/providers/openrouter-ai.provider.ts) (default)
- [`ollama-ai.provider.ts`](apps/backend/src/ai/providers/ollama-ai.provider.ts)
- [`gemini-ai.provider.ts`](apps/backend/src/ai/providers/gemini-ai.provider.ts)

All three extend a shared base class, [`HttpStreamingAiProvider`](apps/backend/src/ai/providers/http-streaming-ai.provider.ts). The base class handles the HTTP call, cancellation, error mapping and logging. Logs record the provider, model, duration and outcome, but never the API key or the prompt. Each adapter only builds its own request and parses its own response format.

### What would need to change to swap the provider?

**Switching between the three included providers needs no code change.** Set `AI_PROVIDER` (and that provider's key or model) in `.env`, then restart the backend:

```sh
docker compose up -d backend
```

No rebuild is needed because these are runtime variables. [`AiProviderFactory`](apps/backend/src/ai/ai-provider.factory.ts) reads `AI_PROVIDER` at startup and creates the matching adapter.

**Adding a new provider follows the Open/Closed principle:** you add code but don't change existing code. The steps are:

1. Write one new adapter class that implements `AiProvider`.
2. Add one `case` to the factory.
3. Add the new name to the `AiProviderName` enum in [`env.validation.ts`](apps/backend/src/config/env.validation.ts).

The chat service, history window, controllers and SSE code stay unchanged.

### How did you handle unexpected or malformed AI responses?

Each provider has a small, pure parser (`*-stream.parser.ts`, sharing [`stream.utils.ts`](apps/backend/src/ai/providers/stream.utils.ts)) that turns raw chunks into text. Every kind of failure maps to its own exception:

| What happened | Exception |
| --- | --- |
| Invalid JSON, unexpected shape, or an empty answer | `AiBadResponseException` |
| Provider error object, safety block, or HTTP 4xx/5xx | `AiProviderErrorException` |
| Provider unreachable (connection refused) | `AiUnavailableException` |
| No first token in time, or the whole answer took too long | timeout → `AI_TIMEOUT` |

[`ChatStreamService`](apps/backend/src/chat/chat-stream.service.ts) turns each one into a safe error code and message for the browser. The provider's own error text is logged on the server but **never sent to the client**. Text that arrived before the failure is kept, so the user can press **Retry**.

The parsers are tested in isolation (`*-stream.parser.spec.ts`). For end-to-end tests, [`FaultInjectingAiProvider`](apps/backend/src/ai/providers/fault-injecting-ai.provider.ts) can fake a failure when a message contains a marker such as `[[e2e-fault:timeout]]`. It is only turned on by `docker-compose.e2e.yml`, never by default.

---

## 2. Streaming

### How does the progressive response work end-to-end?

1. **Browser sends the message.** The frontend sends a normal `POST /api/v1/projects/:id/messages` with `fetch` and reads the response body as a stream ([`stream-chat.ts`](apps/frontend/src/features/chat/stream-chat.ts), [`sse-reader.ts`](apps/frontend/src/features/chat/sse-reader.ts)).
2. **Backend checks first.** Before streaming starts, the backend checks the session, the `Origin` header, project ownership, input validation, that the AI provider is configured, and that no other answer is streaming in this project. If any check fails, it returns a normal JSON error.
3. **Backend streams events.** Once the checks pass, the backend switches the response to `text/event-stream` and writes events through [`SseWriter`](apps/backend/src/chat/sse-writer.util.ts):
   - `message.created`: the user and assistant messages were saved
   - `token`: one event for each piece of text from the AI
   - `done` or `error`: the end of the answer
   - a `ping` comment every 15 seconds keeps the connection open
4. **nginx passes it straight through.** `proxy_buffering off` in [`default.conf.template`](apps/frontend/nginx/default.conf.template) stops nginx from holding tokens back.
5. **The UI shows each token.** Tokens go into a small Zustand store. Only the streaming message component re-renders, not the whole chat (see question 4).

Stop, a closed tab and timeouts all use one cancellation signal per stream. When the client leaves, the backend cancels the AI call and saves the partial answer as `aborted`. Summarise and Retry use the same streaming pipeline.

### What trade-offs did you consider?

- **`fetch` + POST instead of `EventSource`.** `EventSource` only supports GET, cannot send a JSON body, and hides the body of an error response. With `fetch` I can send the message in the body and still read a JSON error such as `409 STREAM_IN_PROGRESS`.
- **SSE instead of WebSockets.** The data only flows one way (server → browser). SSE is plain HTTP, so it works with the existing session cookie and nginx proxy without extra connection handling.
- **Save once at the end, not on every token.** This means far fewer database writes. The cost: if the server process crashes mid-answer, the text kept in memory is lost. To stop a crashed answer from blocking the project forever, [`stale-stream.util.ts`](apps/backend/src/conversations/stale-stream.util.ts) marks a `streaming` message as `error` once it is older than the AI timeout plus a 30-second grace period. This check runs the next time the conversation or project is used (send, reset, delete, or load).
- **Race safety.** Send, summarise, retry, reset and delete all lock the project row first ([`lock-project.util.ts`](apps/backend/src/common/database/lock-project.util.ts)). So an answer can never be saved into a conversation that was just reset, or into a project that is being deleted.

---

## 3. Conversation context

### How does the AI know about the project's design context?

Every AI call starts with a system prompt built by [`buildSystemPrompt`](apps/backend/src/chat/prompts.util.ts). It contains:

- the assistant's role: an automotive colour-material-finish (CMF) design assistant, with rules on how to answer
- the project's title and description, inside a `<project_context>` block
- a line telling the model to treat that block as information about the brief, **not as instructions**

Any `<project_context>` tags typed into the title or description are removed first, so user text cannot break out of the block. The prompt is rebuilt from the database on every call, so an edited description applies to the very next message.

### How do you manage how much history you send?

The pure function `buildPromptMessages` in [`history-window.util.ts`](apps/backend/src/chat/history-window.util.ts) picks the messages to send:

- **Only finished messages count.** Failed or stopped answers are left out.
- **Two limits.** At most `AI_HISTORY_MAX_MESSAGES` (default 20) recent messages, and at most `AI_HISTORY_MAX_CHARS` (default 24,000) characters in total. The oldest messages are dropped first.
- **The newest user message is always kept.**
- **Summaries are pinned.** If the latest summary falls outside the window, it goes right after the system prompt, so long conversations don't forget earlier decisions.

**Reset** never deletes anything. [`ConversationsService.reset`](apps/backend/src/conversations/conversations.service.ts) archives the current conversation and creates an empty one in a single transaction, so the next message starts with a clean history.

The limit counts characters, not tokens. That is an approximation I accepted so the code stays the same for every provider.

---

## 4. State management

### Where does each kind of state live, and why?

| | Server state: **TanStack Query** | Client state: **Zustand** |
| --- | --- | --- |
| What | Session, project list, saved messages of the active conversation | The answer that is streaming right now |
| Files | [`session-query.ts`](apps/frontend/src/features/auth/session-query.ts), [`projects-queries.ts`](apps/frontend/src/features/projects/projects-queries.ts), [`conversation-queries.ts`](apps/frontend/src/features/chat/conversation-queries.ts) | [`chat-stream.store.ts`](apps/frontend/src/stores/chat-stream.store.ts) |
| Lifetime | Comes from the server, survives a reload, cached and shared | Only exists while a stream runs: message id, text so far, phase (`waiting` / `streaming`) and the `AbortController` |

### One specific decision: streamed tokens stay out of the TanStack Query cache

An answer can produce many tokens per second. If each token updated the Query cache, every component that reads the conversation would re-render each time, including the whole message list.

So the work is split:

- **Tokens go only into Zustand.** Only `StreamingBody` in [`streaming-message.tsx`](apps/frontend/src/features/chat/streaming-message.tsx) subscribes to them. A render-count test in `composer.test.tsx` checks that the rest of the list does not re-render.
- **The Query cache only gets the structural events.** `message.created` adds the new rows, and `done` or `error` replaces the assistant row by id with its final content and status ([`use-stream-run.ts`](apps/frontend/src/features/chat/use-stream-run.ts)).

**Why this also helps navigation:** the stream is driven from the app-level QueryClient and store, not from the chat component. So opening another project does not stop the answer, and coming back shows it still streaming.

**Stop has one subtle detail.** The UI marks the message as `aborted` at once. The server only saves `aborted` after it notices the closed connection. So the frontend re-fetches a few times (at 300 ms, 1 s and 2 s) and only accepts the server's version once it no longer says `streaming`.

---

## 5. What I would do differently

### If you had two more days, what would you refactor or add?

1. **Count tokens, not characters.** The history limit in `history-window.util.ts` counts characters, which can over- or under-fill the model's real context window. A tokenizer would make the budget exact.
2. **Load only the history that is sent.** `ChatStreamService` loads the whole conversation and trims it in memory. That is fine at demo sizes, but it should query only the last N messages plus the latest summary.
3. **Limit streams per user.** Today only sign-in is rate limited, plus one active stream per project. Each stream uses provider quota, so a per-user limit across projects would protect it.
4. **Save partial answers periodically.** Saving every few seconds would mean a crash loses seconds of text, not the whole answer.
5. **Browse archived conversations.** Reset keeps old conversations, but there is no screen to view them yet.
6. **Run Playwright in CI.** The end-to-end suite runs on demand against the real stack. It should run in CI against a scripted provider.
7. **Block the seed in production.** The seed user's password is public, so the seed should refuse to run in production unless it is explicitly allowed.

### Why didn't you do these in the time given?

I spent the time on what the brief asks for and on the hardest part to get right: the streaming lifecycle. That meant Stop, Retry, timeouts, disconnects, and the race conditions between send, reset and delete. It also meant safe error handling and a test suite at every level: unit tests, integration tests against a real PostgreSQL, and Playwright end-to-end tests. The items above are improvements on a working base. None of them are missing features from the brief.
