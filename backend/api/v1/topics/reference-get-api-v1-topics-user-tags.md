# GET /api/v1/topics/user-tags

[Back to Topics API](README.md#get-apiv1topicsuser-tags)

Returns the authenticated user's curated moderation-tag catalog as
`{ user_tags: [{ id, slug, label }] }`. The initial catalog contains `Bot` and `Spammer`.
