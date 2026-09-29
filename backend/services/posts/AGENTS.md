# Posts

- All SQL writes to `posts` belong here; other domains call service functions, including `insertStoryPostRecord()` for story posts. [README.md](../../../docs/overview/architecture/services/posts/README.md) and [requirements](../../../docs/requirements/content/POSTS.md) own behavior.
- Publish immediately without draft state. Creation side effects belong to entity-listener jobs, never the creation transaction.
- Admin creation records approval and bypasses automated/community moderation, moderator-agent dispatch, and spam detection, while preserving every non-moderation fan-out (mentions, embeddings, autotagging, sitemap, caches, metrics). This bypass is create-only; moderation-affecting `updatePost()` edits reset clearance/re-enter moderation.
- Search hides flagged posts except from owners/admins. Validate review content before insert/update with the documented admin bypass.
- Keep `topic_recommendation` out of generic/public routes/tools; embeddings include rationale and proposed topic payload.
- Lists use `buildPrivacyFilter()`; direct reads use `canViewPost()` and return 404 when unauthorized.
- Authorization lives in `authorization.mts`. Review ratings use individual CRUD, never bulk replacement through post PATCH.
- `post_type` changes follow [the enum ripple checklist](../../../docs/development/finite-enum-ripple-checklist.md); use [API](../../api/v1/posts/README.md) and [search](../../../docs/overview/architecture/services/posts/search/README.md) contracts.
