# Traffic Routing

[Back to Dev Environment Reference](README.md#traffic-routing)

> **Always access the site through the CF Worker — HTTPS is required for browser-grade validation,
> and direct Next.js traffic is never valid.**

| Entry point    | URL                              | Notes                                                                                                                                                                                                                                                                           |
| -------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CF Worker      | `https://localhost:$WORKER_PORT` | Primary browser entry point                                                                                                                                                                                                                                                     |
| CF Worker HTTP | `http://localhost:$WORKER_PORT`  | Missing-cert liveness fallback only; do not use for browser validation                                                                                                                                                                                                          |
| Next.js direct | `http://localhost:$NEXT_PORT`    | **Do not use** for browsing or browser QA — bypasses auth, CSP, caching, `/api/*` routing. `LOCALIZATION_SSR_REVISION_DIAGNOSTIC=1` may fetch this origin from `dev/localization/local-smoke.mts` only, so the SSR catalog-revision marker is not mixed with Worker HTML cache. |

The CF Worker routes `/api/*`, `/infra/*`, and `/md/*` to the backend; `/sitemap.xml` and `/sitemaps/*` to the sitemaps origin; and everything else to Next.js. Absolute `/images/*` and `/sideload/*` URLs use the image origin directly.
