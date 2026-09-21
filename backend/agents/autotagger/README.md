# Autotagger

This agent runs on post and RSS feed item creation; it does not run on update.
Its main purpose is to automatically add "related topic" relations to posts and RSS feed items.
It uses the `autotagger` system user.

The retained reasoning/tool-search loop uses OpenRouter's OpenResponses-compatible transport. This
is distinct from C6's future embedding-prefilter classifier path: OpenRouter responses settle
foreground usage directly and never enter the direct OpenAI background-response reconciler.

Agentic-run errors store safe error metadata (`name` and `message`) only. Stack traces stay in
internal logging and are not persisted in the run error JSON.

## Rules

- Posts: the LLM's topic cap is tiered by the **post author's** membership plan (admin authors are treated as pro-level, since plan resolution has no admin concept) — free authors get zero topics and the LLM is never called. See [Autotagger feature limits](../../../docs/requirements/users/reference-memberships-feature-limits.md#autotagger) for the per-tier table.
- RSS feed items: topic enrichment is additive across three independent sources that stack rather than replace one another — (1) category→topic mapping (pre-existing, unaffected by this tiering), (2) a discoverable-source LLM pass, and (3) a no-LLM collaborative-filter pass over paid followers (`applyCollaborativeTopicRelations`, capped separately per Plus/Pro follower). See [Source Item Anatomy](../../../docs/requirements/anatomy/source-item.md) for the full topic-source breakdown. The collaborative pass runs (when enabled) even for non-discoverable items that skip the LLM pass; the durable idempotency marker is only written after both passes complete, so a crash between them safely re-applies on retry. It includes current `active`/`past_due` memberships only, excluding deleted/cancelled/expired/paused memberships and elapsed `expires_at` values, matching RSS crawl follower lifecycle semantics.
- All caps above are runtime-configurable through DynamicConfig namespace `autotagger-paid-limits`. The private collaborative caps must remain monotonic: Plus ≤ Pro.
- `add_related_topic` explicitly authorizes the `autotagger` system agent for post and RSS feed item category writes; do not grant the agent administrator rights for this workflow.

## Inputs

- Post or RSS Feed Item ID and content

## Tools

- Search topics by semantic text search
- Search topics by full text search
- Automatically add a related topic by post/rss-feed-item id and topic id
