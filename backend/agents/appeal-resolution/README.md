# @agents/appeal-resolution

LLM agent that drafts a recommended resolution for a moderation appeal.

Given a moderation appeal ID, the agent fetches the appeal and the original action context
(user warning reason, community ban reason, or removed post content), sanitizes all external
content against prompt injection, and calls OpenRouter's OpenResponses-compatible structured-output API to produce a
`recommended_action` (one of `accept`, `deny`, or `reduce`), a human-readable `public_response`
draft, and an `internal_response` for moderator context. Results are written back to the appeal
row via `createModerationAppealDraft`. The agent never delivers text to users; all drafts require
explicit human approval before delivery. Its lifecycle preflight reads the primary database so a
queued run cannot bill a model call after approval, delivery, or resolution has committed but has
not reached a read replica.

The OpenRouter call remains foreground-only and records its terminal response ID, returned model,
usage, and billed cost directly in the shared AI usage ledger; it is not registered in the direct
OpenAI background-response reconciler.

**Trigger:** enqueued via `@queues/ai-agents/enqueues/appeal-resolution` immediately after a new
appeal is created, or on demand when a staff member requests an AI rerun from the `/appeals` page.
