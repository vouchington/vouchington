# Story Post Agent

Generates a concise headline and AI summary markdown for a news story, given the story entity and a list of source article summaries.

## Pattern

Single-call agent — one `createOpenAIResponse` call, no tool use. Uses `parseLLMJsonResponse` to extract structured JSON from the LLM response.

## Inputs

- `story: Story` — the story entity (provides title, published_at, id for safety identifier)
- `itemSummaries: Array<{ title: string; summary: string }>` — source article summaries (sanitized before sending)

## Outputs

- `title` — concise neutral headline, max 100 characters, no publication names. Falls back to `story.title` if the response is unparseable.
- `ai_summary_markdown` — 2–3 sentence markdown summary. Empty string on fallback.

## Rules

- Title must be ≤ 100 characters, neutral, and factual
- No publication names in the title
- All external content (article titles, summaries, story title) is sanitized via `sanitizePromptInjection()` and wrapped with `wrapExternalContent()`
- Always fall back gracefully (do not throw) when the LLM response is unparseable

## System User

Uses the story `id` as the `safety_identifier` (not a dedicated system user).

## Related

- Story clustering agent: [../story-clustering/README.md](../story-clustering/README.md)
- Agents overview: [../CLAUDE.md](../CLAUDE.md)
