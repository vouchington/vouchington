# POST /api/v1/posts/:idOrSlug/sends

[Back to Posts API](README.md#post-apiv1postsidorslugsends)

Queues manual-send notification rows for the caller's current followers only. Distribution runs in
bounded follower chunks, and each notification chunk enqueues normal push delivery.

Request:

```json
{ "audience": "all_followers" }
```

or

```json
{
  "audience": "selected_followers",
  "recipient_user_ids": ["<uuid>"]
}
```

Selected recipients must contain 1–100 distinct valid UUIDs, must all currently follow the sender,
and cannot be combined with unknown request fields. `all_followers` requests contain only
`audience`. A missing target remains 404 and target/policy semantic failures remain 400 before a
malformed union body is diagnosed as 422.
