# Stories

- RSS story-post creation requires `rss_feeds.is_discoverable = TRUE`: call `assertRssFeedItemIsDiscoverable()`/`assertStoryIsDiscoverable()` at the route boundary after `requireAuthAndRateLimit`, before service primitives, never inside `prepareStoryPost`. Link posts accept any non-blocked URL without this gate; follow requirements.
- `prepareStoryPost` selects `stories.title` with item-title fallback for multiple items and `story.title ?? 'Story'` without items; never call an LLM inline. Fewer than two items throws 422; single-item discussion uses `prepareLinkPost`.
- Insert the post and `approve` clearance, then fire-and-forget `enqueueStoryPostAgent(post.id)`. The worker skips non-empty `ai_summary_markdown` unless `force: true`.
- Admin assignment/removal awaits `refreshStoryPostForStory(storyId)` before cache invalidation; best-effort clustering may fire-and-forget. Refresh is a no-op without an existing story post.
- Initial approval makes the post visible immediately; async moderation may demote to `rejected`. Use [agent](../../../docs/overview/architecture/ai-agents/README.md) and [clearance](../../../docs/overview/architecture/services/README.md) contracts.
