# POST /api/v1/rss-feeds/:id/refreshes

[Back to RSS Feeds API](README.md#post-apiv1rss-feedsidrefreshes)

Enqueues an RSS feed fetch job. The API does not fetch the remote feed synchronously.

The authenticated feed lookup happens before refresh query or body diagnostics, so a missing feed
remains 404. A valid `force` query value wins over a JSON body, including malformed JSON. Without a
query value, the JSON body may supply `force` using an actual boolean, case-insensitive `true` or
`false`, `1` or `0`, or a finite number (zero is false; any nonzero number is true). Null, arrays,
objects, and other strings are invalid and return 422 without queuing a job.

Query parameter or request body:

- `force` — boolean, bypass cache and force re-fetch

Malformed JSON without a valid query fallback returns 400; an oversized parsed JSON body returns 413. Api-server rejects a non-JSON body-bearing refresh with 415 before the handler. A bodyless
refresh remains valid.

Response:

```json
{
  "success": true,
  "message": "RSS feed refresh enqueued",
  "rss_feed_id": "...",
  "force": false
}
```
