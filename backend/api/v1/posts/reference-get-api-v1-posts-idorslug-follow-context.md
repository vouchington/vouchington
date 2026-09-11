# GET /api/v1/posts/:idOrSlug/follow-context

[Back to Posts API](README.md#get-apiv1postsidorslugfollow-context)

Authenticated-only personalization payload for post detail pages. Returns:

- `positive_by_following`
- `negative_by_following`

Each field is shaped as `{ total, users }`, where `users` is a capped list of hydrated public users.

Auth and error semantics:

- unauthenticated requests return `401`
- requests for a missing post return `404`
- requests for a post the viewer cannot access also return `404`, matching other post read routes so restricted content is not disclosed
