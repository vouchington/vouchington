# @services/moderators

Moderator-specific post-tagging actions — delegates to the posts service with moderator authorization.

## Key exports

- `tagPostWithTopicForModerators(currentUser, postId, topicSlug)` — tags a post with a topic on behalf of a moderator
- `tagPostWithTopicsForModerators(currentUser, postId, topicSlugs)` — bulk-tags a post with multiple topics

## Related

- Parent: [../CLAUDE.md](../CLAUDE.md)
- Posts service: [../posts/README.md](../posts/README.md)
- Topics service: [../topics/README.md](../topics/README.md)
