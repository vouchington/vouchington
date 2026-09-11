# Sessions

[Back to Cloudflare Worker](README.md#sessions)

- Detect bots with `isbot`
- Detect likely-authenticated users with a valid signed `st` cookie plus the presence of `dt`. If
  the verified session payload contains `uid`, bypass cache for that request.
- For bots, cache eligible responses for 1 day and do not send cookies to the origin for cacheable requests.
- For unauthenticated users, cache eligible responses for 30 seconds and do not send cookies to the origin for cacheable requests.
