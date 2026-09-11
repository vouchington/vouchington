# Stories Service

Agent rules for stories. Full feature spec: [../../../docs/requirements/content/stories.md](../../../docs/requirements/content/stories.md).

## Rules

- **Discoverability gate:** story-post creation from RSS feed items requires `rss_feeds.is_discoverable = TRUE`. Use `assertRssFeedItemIsDiscoverable(rssFeedItemId)` or `assertStoryIsDiscoverable(storyId)` from `authorization.mts`. Call them at the route boundary (between `requireAuthAndRateLimit` and service primitives) — do not put the check inside `createStoryPost`. Link-post creation has no discoverability gate — any non-blocked URL is valid.
- **Title selection in `createStoryPost`:** multi-item → `stories.title` (fallback to item title); no items → `story.title ?? 'Story'`. No LLM call inline. Stories with fewer than 2 items throw 422 — use `createLinkPost` for single-item discussions.
- **Create-then-enqueue pattern:** insert the post and record an `approve` clearance change, then call `enqueueStoryPostAgent(post.id)` fire-and-forget. The worker is idempotent: skips if `ai_summary_markdown` is already non-empty unless `force: true` is passed.
- **Story-post refresh:** admin assignment and removal await `refreshStoryPostForStory(storyId)` before invalidating story caches. Best-effort clustering callers may invoke it fire-and-forget. The function is a no-op if no story post exists yet.
- **Visibility:** story posts record an `approve` clearance change so the initiating user sees the post immediately. Moderation runs async and can demote to `rejected`.

## See Also

- Agent: [../../agents/story-post/README.md](../../agents/story-post/README.md)
- Clearance: [../post-clearance/README.md](../post-clearance/README.md)
- Parent: [../CLAUDE.md](../CLAUDE.md)
- Requirements: [../../../docs/requirements/content/stories.md](../../../docs/requirements/content/stories.md)
