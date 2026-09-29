# Stories

- RSS story-post creation requires `rss_feeds.is_discoverable = TRUE`: call `assertRssFeedItemIsDiscoverable()`/`assertStoryIsDiscoverable()` at the route boundary after `requireAuthAndRateLimit`, before service primitives, never inside `createStoryPost`. Link posts accept any non-blocked URL without this gate; follow [requirements](../../../docs/requirements/content/stories.md).
- `createStoryPost` selects `stories.title` with item-title fallback for multiple items and `story.title ?? 'Story'` without items; never call an LLM inline. Fewer than two items throws 422; single-item discussion uses `createLinkPost`.
- Insert the post and `approve` clearance, then fire-and-forget `enqueueStoryPostAgent(post.id)`. The worker skips non-empty `ai_summary_markdown` unless `force: true`.
- Admin assignment/removal awaits `refreshStoryPostForStory(storyId)` before cache invalidation; best-effort clustering may fire-and-forget. Refresh is a no-op without an existing story post.
- Initial approval makes the post visible immediately; async moderation may demote to `rejected`. Use [agent](../../../docs/overview/architecture/ai-agents/story-post/README.md) and [clearance](../../../docs/overview/architecture/services/post-clearance/README.md) contracts.
