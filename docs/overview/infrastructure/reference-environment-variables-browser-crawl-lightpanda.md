# Environment Variables reference

[Back to Environment Variables](environment-variables.md)

## Browser Crawl (Lightpanda)

The `crawl_browser` queue (worker-cpu, concurrency 1) renders JS-heavy referral-link destination
URLs via Playwright connected to Lightpanda's cloud CDP endpoint — no local browser binary. See
[`backend/services/browser-crawl/crawl.mts`](../../../backend/services/browser-crawl/crawl.mts).

| Name                 | Required | Where | Notes                                                                                                                                                                                        |
| -------------------- | -------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LIGHTPANDA_CDP_URL` | Yes      | ECS   | Non-secret base `wss://` CDP endpoint (e.g. `wss://uswest.cloud.lightpanda.io/ws`); the auth token is appended in-memory, never logged or interpolated into it                               |
| `LIGHTPANDA_TOKEN`   | Rollout  | SM    | Lightpanda cloud SaaS API token, worker-cpu only. Injected into ECS only when `lightpanda_token_enabled = true`; when unset, a `crawl_browser` job throws a clear error only if actually run |
