# GET /api/v1/topics/:idOrSlug/follow-context

[Back to Topics API](README.md#get-apiv1topicsidorslugfollow-context)

Authenticated-only personalization payload for topic detail pages. Returns:

- `positive_by_following`
- `negative_by_following`
- `following_topic_followers`

Each field is shaped as `{ total, users }`, where `users` is a capped list of hydrated public users.
