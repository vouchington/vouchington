# Posts

Agent rules for the posts service. Feature behavior, key files, post types, privacy, moderation,
ratings, and creation-side-effect architecture are canonical in [README.md](README.md) and the
[posts requirements](../../../docs/requirements/content/POSTS.md).

## Scoped invariants

- All SQL writes to `posts` belong in this service. Other domains call its functions; story posts
  use `insertStoryPostRecord()`.
- Posts publish immediately; there is no draft state. Post-creation side effects belong to entity
  listener jobs, not the creation transaction.
- Admin creation records approval and bypasses automated moderation, moderator-agent dispatch,
  community moderation, and spam detection, but still runs every non-moderation fan-out, including
  mentions, embeddings, autotagging, sitemap, cache, and metrics work. This bypass is create-only:
  moderation-affecting edits through `updatePost()` reset clearance and re-enter moderation.
- Search hides moderation-flagged posts from everyone except the post owner and administrators.
- Validate review content before insert or update, with the documented admin bypass.
- Keep `topic_recommendation` out of generic/public routes and agent tools, and include both its
  rationale and proposed topic payload in embeddings.
- Use `buildPrivacyFilter()` for listings and `canViewPost()` for direct reads; unauthorized reads
  return 404.
- Keep authorization functions in `authorization.mts`. Review ratings use individual CRUD and are
  never bulk-replaced through the post PATCH route.
- Follow the [Finite Enum Ripple Checklist](../../../docs/development/finite-enum-ripple-checklist.md)
  when changing `post_type`.

## See Also

- [API routes](../../api/v1/posts/README.md)
- [Search](search/README.md)
- [Parent service rules](../CLAUDE.md)
