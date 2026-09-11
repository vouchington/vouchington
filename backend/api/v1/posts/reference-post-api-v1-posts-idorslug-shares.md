# POST /api/v1/posts/:idOrSlug/shares

[Back to Posts API](README.md#post-apiv1postsidorslugshares)

Queues feed-share rows for the caller's current followers only. Later followers do not receive the
event. Distribution runs in bounded follower chunks. The route rejects self-shares, comments, and posts that are not broadly visible
(`privacy='public'` with `broadcast='everyone'` or `broadcast='users'`).

The request has no body and does not require a JSON `Content-Type` header.

Response:

```json
{ "status": "accepted", "distribution_id": "<uuid>" }
```
