# Origin and Browser `Vary` Boundaries

[Back to Caching Strategy reference](reference-caching-strategy-cache-tiers.md#origin-and-browser-vary-boundaries)

Workers Cache interprets an origin `Vary` at the inner `CachedOrigin` boundary, where client cookie
and authorization headers have already been deliberately removed. Passing that header through
would either fragment the platform cache on headers represented by `ctx.props` or encode misleading
variants. `CachedOrigin` therefore validates the origin tokens before a cache write. The safe set is
`Cookie`, `Authorization`, `Accept-Encoding`, `Accept-Language`, `RSC`,
`Next-Router-State-Tree`, `Next-Router-Prefetch`, `Next-Router-Segment-Prefetch`, and `Next-Url`.
It tunnels those tokens in the internal `x-voucha-cache-vary` response header and removes the
origin `Vary`. `Vary: *` or any unknown token fails closed with `private, no-store`.

The always-run gateway removes the internal marker and restores the validated tokens on the outer
client response. For every anonymous backend response it also merges `Cookie, Authorization`, even
when the backend did not emit them. This outer `Vary` is a browser and intermediary correctness
boundary: after an anonymous fetch, adding signed-in cookies causes the browser to make a new
request instead of reusing anonymous JSON. The authenticated request then reaches the gateway,
which bypasses `CachedOrigin`. The internal marker must never be exposed to clients.

Local Wrangler can exercise dispatch and response rewriting, but it does not reproduce a true
platform HIT in front of the named entrypoint. HIT/MISS, stale-window, and cache-version behavior
must therefore be verified on staging.
