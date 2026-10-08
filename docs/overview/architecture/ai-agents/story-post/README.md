# Story Post Agent

Source entrypoint: [backend/agents/story-post/README.md](../../../../../backend/agents/story-post/README.md)

Generates a concise headline and AI summary markdown for a news story, given the story entity and a list of source article summaries.

## Pattern

Single-call agent — one schema-constrained `generateJson` call on the `{ provider, model }` the `story-post` setting holds (Haiku 5.5 by default), no tool use. The provider layer validates the JSON answer against the title and summary schema, and the shared usage ledger is settled by `callAgentModel`; direct OpenAI keeps the background-response reconciler, Anthropic and OpenRouter do not.

## Inputs

- `story: Story` — the story entity (provides title, published_at, id for safety identifier)
- `itemSummaries: Array<{ title: string; summary: string }>` — source article summaries (sanitized before sending)

## Outputs

- `title` — concise neutral headline, max 100 characters, no publication names. Falls back to `story.title` (or `Story`) when the model returns an empty title.
- `ai_summary_markdown` — 2–3 sentence markdown summary. A blank summary is rejected, so the job fails rather than saving an empty one.

## Rules

- Title must be ≤ 100 characters, neutral, and factual
- No publication names in the title
- All external content (article titles, summaries, story title) is sanitized via `sanitizePromptInjection()` and wrapped with `wrapExternalContent()`
- Always fall back gracefully (do not throw) when the LLM response is unparseable

## System User

Uses the story `id` as the `safety_identifier` (not a dedicated system user).

## Related

- Story clustering agent: [../story-clustering/README.md](../story-clustering/README.md)
- Agents overview: [../AGENTS.md](../../../../../backend/agents/AGENTS.md)
