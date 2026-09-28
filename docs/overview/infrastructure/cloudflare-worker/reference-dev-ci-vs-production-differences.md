# Dev/CI vs. Production Differences

[Back to Cloudflare Worker](README.md)

| Feature                        | Production (Cloudflare Edge)                          | Dev/CI (Miniflare/workerd)                                                             |
| ------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Rate limiter bindings          | Real Cloudflare Rate Limiter                          | Absent (no-op)                                                                         |
| `cf-ipcountry` header          | Set by Cloudflare                                     | Absent — and `cf-ray` is also absent, so geo-blocking is disabled in dev/CI            |
| `cf-connecting-ip`             | Set by Cloudflare                                     | Absent                                                                                 |
| Named-entrypoint Workers Cache | Cloudflare edge cache with platform HIT/MISS behavior | Local Wrangler dispatches to `CachedOrigin` but does not reproduce a true platform HIT |
| Inspector                      | N/A                                                   | workerd inspector on random port                                                       |
| TLS                            | Cloudflare manages                                    | Optional local mkcert certs                                                            |

These differences mean:

- Geo-blocking is effectively disabled in dev/CI (neither `cf-ray` nor `cf-ipcountry` is present)
- Rate limiting is a no-op in dev/CI (no bindings + Playwright global-setup disables it)
- Cache behavior uses repo-owned Wrangler runtime paths. Local runs write under `cloudflare-worker/.wrangler/runtime/`; CI writes under `${RUNNER_TEMP:-$TMPDIR}/voucha-wrangler/worker-${WORKER_PORT}-attempt-${GITHUB_RUN_ATTEMPT:-0}/`. The runtime root is shared across restarts within a run so the already-initialized directory is reused (avoids filesystem errors when workerd writes blobs into a brand-new directory). The CI setup step and `scripts/wrangler/start.mts` clear that directory before Wrangler starts because stale persisted worker cache has caused false failures.
