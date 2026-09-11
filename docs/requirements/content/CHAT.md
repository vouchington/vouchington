# Chat

## Routes

| Route                   | File                                            | Description                                |
| ----------------------- | ----------------------------------------------- | ------------------------------------------ |
| `/chat`                 | `web/app/(chat)/chat/page.tsx`                  | Start a new conversation                   |
| `/chat/:conversationId` | `web/app/(chat)/chat/[conversationId]/page.tsx` | View and continue an existing conversation |

Both routes are `force-dynamic` (no caching) and carry `noindex` metadata.

## Components

| Component              | File                                             | Purpose                                           |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `ChatLayout`           | `web/components/chat/chat-layout.tsx`            | Page-level layout; enforces 2-slot invariant      |
| `ChatMessages`         | `web/components/chat/chat-messages.tsx`          | Scrollable message list with streaming support    |
| `ChatInput`            | `web/components/chat/chat-input.tsx`             | Composer: textarea + send/stop button             |
| `ChatToolCall`         | `web/components/chat/chat-tool-call.tsx`         | Collapsible tool call disclosure during streaming |
| `ChatSubagentProgress` | `web/components/chat/chat-subagent-progress.tsx` | Active subagent step indicator during streaming   |

## Layout Rule

`ChatLayout` enforces a **2-slot invariant** — it throws at render time if it does not receive exactly two non-null children (`messages` + `input`). The outer wrapper uses `h-full flex-col` so the page fills the viewport. `ChatMessages` owns the single scroll container (`overflow-y-auto`) on its root element. **Do not add `overflow-y-auto` to `ChatLayout`'s messages wrapper div** — doing so creates a double-scroll region.

## Composer Requirement

`ChatInput.handleSubmit` must call `e.preventDefault()` as its **first statement**, before any guard clauses. This prevents the browser from performing a full-page GET/POST reload on form submission:

```ts
function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
  e.preventDefault() // must be first — prevents full page reload
  if (isStreaming) return
  // ...
}
```

## No-Refresh Invariant

Submitting a message must **never** cause a full page reload. Ensure:

1. `handleSubmit` calls `e.preventDefault()` first (see above).
2. New-conversation flow uses `router.push('/chat/' + conversationId)` (client-side navigation), not `window.location.href`.
3. The send handler uses `fetch` directly, not a `<form action>` server action that would trigger a navigation.

## SSE Event Contract

Hosted providers stream SSE over `POST /api/v1/conversations/:conversationId/chat`. The request body is `{ "message": string, "provider"?: "openai" | "anthropic" }`; omitted `provider` preserves the OpenAI default. `anthropic` uses the hosted Anthropic Messages API upgrade path. Each event follows the format:

```
event: <name>
data: <json>

```

| Event           | Payload fields                                                         | Description                                                                                                |
| --------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `metadata`      | `conversation_id`, `user_message_id`, `assistant_message_id`, `job_id` | Sent first; provides IDs for the persisted user message, the new assistant message, and the background job |
| `text`          | `content: string`                                                      | Incremental text chunk; append to `streamedContent`                                                        |
| `tool_call`     | `tool_call_id`, `name`, `arguments`                                    | A tool the assistant is invoking                                                                           |
| `tool_result`   | _(varies)_                                                             | Result of a tool call; currently displayed inline via tool call disclosure                                 |
| `subagent_step` | `agent_name`, `tool_name`, `tool_call_id`                              | A step taken by a subagent; shown in `ChatSubagentProgress`                                                |
| `subagent_text` | `agent_name`, `tool_call_id`, `content: string`                        | Child stream text emitted by a subagent; display separately from top-level assistant `text` chunks         |
| `done`          | _(empty object)_                                                       | Stream complete; consumer should commit the buffered message                                               |
| `error`         | `error: string`                                                        | Streaming error; consumer should surface the message to the user                                           |

The `useChatStream` hook (`web/hooks/use-chat-stream.ts`) implements this protocol and exposes `sendMessage`, `abort`, `isStreaming`, `streamedContent`, `toolCalls`, `subagentSteps`, `subagentTextChunks`, `metadata`, and `error`.

The web client reads and parses chunks sequentially from one stream so event ordering and stream
backpressure are preserved. When a newer request makes a reader stale, the client finishes
canceling that reader before returning and does not dispatch its remaining events.

The server owns a 120-second connection cycle. Metadata is emitted immediately after the SSE
response starts, before token subscription or queue enqueue, and its non-null `job_id` is derived
from `assistant_message_id`; the queue uses that same value for both job identity and deduplication.
`done` and named `error` are the only terminal
protocol events. Web, Swift, and .NET treat EOF before either event as an interrupted response and
show a localized retry message. Explicit user cancellation remains non-error. Chat is still a
one-shot job, so connection expiry sends a distinct `sse-cycle-expired` signal. The worker stops the
generator and durably marks the assistant message with the localized retryable interruption error,
while preserving partial content. Ordinary client disconnect or explicit cancellation still stops
cleanly without adding an error. Chat has no reattachment endpoint. If the connection ends before the token subscription is acquired, the
server marks the durable assistant placeholder with a retry error before returning so it cannot
block the next turn.

The assistant message is also the durable execution fence: creation of its top-level agentic run is
an atomic one-shot claim, so concurrent queue deliveries cannot start multiple providers or emit
multiple terminal events. A five-minute scheduled reconciler marks runs still active after ten
minutes, and their assistant messages, failed in one transaction. Terminal writes use the run's
nonterminal state as a compare-and-set fence, preventing a late worker from overwriting recovery.

Native clients that generate assistant text locally use `POST /api/v1/conversations/:conversationId/client-generated-chat` instead of the SSE endpoint. The body is `{ "message": string, "assistant_content": string, "model_provider": "apple_foundation" }`, and the response returns persisted `user_message`, `assistant_message`, and completed `agentic_run` metadata.

## Seeded Playwright Fixture

Seeded conversations exist for Playwright tests. Their constants are exported from:

```
backend/scripts/seeds/playwright-test-data/conversations.mts
```

```ts
export const SEEDED_CONVERSATION_ID = '019e0000-0000-7000-8000-000000000001'
export const SEEDED_SECOND_PAGE_CONVERSATION_ID = '019e0000-0000-7000-8000-000000000104'
export const SEEDED_SECOND_PAGE_CONVERSATION_TITLE = 'Playwright Sidebar Page 2 Conversation'
```

`SEEDED_CONVERSATION_ID` contains a multi-turn credit card advice conversation between the test
user and the assistant. The sidebar pagination fixtures add enough conversations for the test user
to expose `Load More Chats`; `SEEDED_SECOND_PAGE_CONVERSATION_ID` is expected to appear only after
loading the second sidebar page in a clean Playwright database.

## Sidebar State

The chat sidebar conversation list is shared through a signed-in-only client provider mounted in the
app shell. Route changes must not refetch or replace the list; this preserves conversations loaded
with `Load More Chats`. New conversation creation updates the provider directly before navigating to
`/chat/:conversationId`.

## Testing

### Playwright

- Tests live in `playwright/tests/chat/`.
- **Do not make real OpenAI calls in Playwright.** Mock the SSE endpoint with `page.route`:

```ts
await page.route('**/api/v1/conversations/*/chat', async route => {
  await route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
    body: [
      'event: metadata\ndata: {"conversation_id":"test-id","user_message_id":"user-msg-id","assistant_message_id":"msg-id","job_id":"job-id"}\n\n',
      'event: text\ndata: {"content":"Here are the best travel rewards cards..."}\n\n',
      'event: done\ndata: {}\n\n',
    ].join(''),
  })
})
```

- Use `SEEDED_CONVERSATION_ID` from the seed file when navigating to `/chat/:id` in tests.
- Use `SEEDED_SECOND_PAGE_CONVERSATION_ID` / `SEEDED_SECOND_PAGE_CONVERSATION_TITLE` for sidebar
  pagination preservation tests.
- Top-level interactive chat components (e.g. `ChatInput`, `ChatMessages`) must carry a `data-pw` attribute and have at least one Playwright test that reaches it. Inner content components (e.g. `ChatToolCall`, `ChatSubagentProgress`) are exempt unless they need direct Playwright targeting.

### Vitest

- Unit tests live in `web/components/chat/__tests__/`.
- Do not mock PostgreSQL, Valkey, or internal service calls; keep `vi.mock()` / `vi.spyOn()` in `.mock.test.<ext>` files only.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions
- [docs/requirements/navigation/COMPONENTS.md](../navigation/COMPONENTS.md) — shared component patterns
- [docs/requirements/navigation/ROUTES.md](../navigation/ROUTES.md) — full route inventory
