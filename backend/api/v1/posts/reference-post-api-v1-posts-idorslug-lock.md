# POST /api/v1/posts/:idOrSlug/lock

[Back to Posts API](README.md#post-apiv1postsidorsluglock)

Locks a post or comment thread. Once locked, new replies are rejected with `403` and error code `POST_THREAD_LOCKED`. Requires authentication as the post author, a community moderator/owner (for community-scoped posts and comments), or a site admin.

Returns `204 No Content`.
