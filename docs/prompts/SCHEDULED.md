# Scheduled Prompts

Rotating maintenance prompts selected from [scheduled/](scheduled/) by
[scheduled-prompts.yml](../../.github/workflows/scheduled-prompts.yml).
The workflow renders the selected prompt through
[scheduled-prompt.md](automation/scheduled-prompt.md) before calling
[harness-dispatch.yml](../../.github/workflows/harness-dispatch.yml).
Issue prompts marked `harness-scheduled-scope: existing-issues` use the existing-issue maintenance
contract: the trusted caller snapshots deterministic ascending issue-number pages of at most 50,
freezes the cycle's upper bound, and continues pages until every issue in that cycle is covered.
Taxonomy is snapshotted and must remain unchanged, and a non-no-op run must report an existing open
issue from its supplied page whose metadata or comments changed during the run.

## Prompt Index

| Prompt                                                                   | Maintenance focus                                                                                                                                                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [accessibility.md](scheduled/accessibility.md)                           | WCAG behavior plus Storybook axe and applicable Playwright route-audit preflight.                                                                                                            |
| [agent-sandbox-policy.md](scheduled/agent-sandbox-policy.md)             | Agent sandbox and permission configuration: staleness, breadth drift, and cross-harness parity across Claude, Codex, and Grok.                                                               |
| [agent-skill-docs.md](scheduled/agent-skill-docs.md)                     | Agent instruction ownership: scoped invariants, triggerable skills, canonical docs, discovery parity, and duplicate removal.                                                                 |
| [api-performance.md](scheduled/api-performance.md)                       | API route round trips, batching, caching, performance docs, and N+1 prevention.                                                                                                              |
| [auth.md](scheduled/auth.md)                                             | Authentication security, database/Valkey load, bot detection, and simplification.                                                                                                            |
| [backend-real-tests.md](scheduled/backend-real-tests.md)                 | Backend test realism: replace internal mocks with real service, PostgreSQL, Valkey, and queue assertions; retain external-provider seams.                                                    |
| [caching.md](scheduled/caching.md)                                       | Cross-tier cache coherence: cache-key/`Vary` boundaries, TTL alignment across edge/backend/Valkey, Cache-Tag purge coverage, and no-cache boundaries.                                        |
| [ci.md](scheduled/ci.md)                                                 | CI efficiency, analyzer replacement parity, partial-rerun coherence, and duplicate-run prevention.                                                                                           |
| [ci-job-runtime.md](scheduled/ci-job-runtime.md)                         | Read-only CI job runtime audit with one tracked issue or explicit no-op.                                                                                                                     |
| [ci-log-quality.md](scheduled/ci-log-quality.md)                         | CI failures, misleading warning/error output, and excessive logs with one diagnostics-preserving fix PR.                                                                                     |
| [cloudflare-worker.md](scheduled/cloudflare-worker.md)                   | Worker routing, caching, CSP, rate limiting, sitemaps, and proxy behavior.                                                                                                                   |
| [automation-fix-prevention.md](scheduled/automation-fix-prevention.md)   | Incident-driven prevention of recurring `automation:auto-fix` failure classes: preventive lint/AST/test-harness guards and root-cause completeness; excludes transient-retry classification. |
| [crawler-rss.md](scheduled/crawler-rss.md)                               | Crawler politeness, feed parsing, dedupe, retries, and RSS ingestion reliability.                                                                                                            |
| [dependencies.md](scheduled/dependencies.md)                             | pnpm exemption and Knip hygiene, including low-importer duplicate-seam consolidation and frozen workspace dependency maintenance.                                                            |
| [docker.md](scheduled/docker.md)                                         | ECS Fargate ARM64 image size, performance, cost, cheap-first preflight, retained runtime validation, and post-merge verification tracking.                                                   |
| [docs.md](scheduled/docs.md)                                             | Documentation links, semantic diagrams, README coverage, and repository-wide CLAUDE.md context budgets.                                                                                      |
| [feature-flags.md](scheduled/feature-flags.md)                           | Flag definition/read/admin/override consistency; frontend-only gating; safe defaults.                                                                                                        |
| [first-party-dependencies.md](scheduled/first-party-dependencies.md)     | First-party workaround root causes, upstream ownership, registry drift, deduplicated Vouchington `dependencies` issues, and linked local removal work.                                       |
| [github-issue-hygiene.md](scheduled/github-issue-hygiene.md)             | Existing issue labels, canonical priorities, and open milestone assignment without taxonomy creation.                                                                                        |
| [loading-states.md](scheduled/loading-states.md)                         | Loading skeletons, Suspense jank, force-dynamic cleanup, and streaming rules.                                                                                                                |
| [localization.md](scheduled/localization.md)                             | Locale resolution, language metadata, canonical URLs, and UI locale cache variation.                                                                                                         |
| [moderation.md](scheduled/moderation.md)                                 | Post clearance, reports, community moderation, modlog, appeals, ban evasion, and automated actors.                                                                                           |
| [notifications.md](scheduled/notifications.md)                           | Inbox behavior, subscription fanout, notification dedupe, reconciliation, and browser push.                                                                                                  |
| [observability.md](scheduled/observability.md)                           | Sentry, structured logs, analytics events, queue metrics, and diagnostics.                                                                                                                   |
| [playwright.md](scheduled/playwright.md)                                 | Playwright reliability, minimal retry scope, stable assertions, performance, and browser-side failures.                                                                                      |
| [postgresql-explain-analyze.md](scheduled/postgresql-explain-analyze.md) | EXPLAIN ANALYZE seed/run/analyze workflow, query plan improvements, and bounded schema-growth partition classification audits.                                                               |
| [privacy-data-retention.md](scheduled/privacy-data-retention.md)         | Account deletion/export, consent, privacy settings, and retention behavior.                                                                                                                  |
| [queues-workers.md](scheduled/queues-workers.md)                         | Queue idempotency, retries, DLQs, scheduling, shutdown, and source-to-runtime registration/catalog/policy parity.                                                                            |
| [rate-limiting.md](scheduled/rate-limiting.md)                           | Worker IP limits, per-endpoint limits, trust-tier computation, and post-cache bot limits.                                                                                                    |
| [react.md](scheduled/react.md)                                           | React identity transitions, runtime RSC payload projection, purity, Context placement, and test coverage.                                                                                    |
| [runtime-spot-resilience.md](scheduled/runtime-spot-resilience.md)       | Bounded SSE/WebSocket cycles, client retry, premature EOF handling, and durable long-work recovery.                                                                                          |
| [search.md](scheduled/search.md)                                         | Global search, list filters, privacy/moderation filtering, pagination, ranking, and search caches.                                                                                           |
| [security.md](scheduled/security.md)                                     | Application threat models, authorization boundaries, and security tests.                                                                                                                     |
| [seo-indexing.md](scheduled/seo-indexing.md)                             | Canonicals, robots, metadata, structured data, sitemaps, and indexability.                                                                                                                   |
| [simplify.md](scheduled/simplify.md)                                     | DRY opportunities, utility consolidation, and small safe cleanups.                                                                                                                           |
| [static-code-analysis.md](scheduled/static-code-analysis.md)             | Static-analysis strictness, parser-migration leftovers, exemptions, and ast-grep symbol coverage.                                                                                            |
| [storybook.md](scheduled/storybook.md)                                   | Pure component extraction, Storybook stories, and Storybook-backed tests.                                                                                                                    |
| [supply-chain-security.md](scheduled/supply-chain-security.md)           | CI/CD workflow hardening, GITHUB_TOKEN least-privilege, pull_request_target safety, dependency-CVE triage, and scanner coverage.                                                             |
| [test-pruning.md](scheduled/test-pruning.md)                             | Coverage-safe removal or rewrite of skipped, duplicate, tautological, or indirection-only tests.                                                                                             |
| [transient-retry.md](scheduled/transient-retry.md)                       | CI retry root-cause fixes and rule retirement, fingerprint consolidation, coherent reruns, and one deduplicated issue fallback.                                                              |
| [translation-safety.md](scheduled/translation-safety.md)                 | Automatic translation privacy, freshness, source preservation, metadata, and rendering boundaries.                                                                                           |
| [ui-internationalization.md](scheduled/ui-internationalization.md)       | UI message catalogs, interpolation, pluralization, raw-key prevention, hydration, and locale-safe formatting.                                                                                |
| [valkey.md](scheduled/valkey.md)                                         | Valkey in-flight minimization, request batching, Lua scripts, race conditions, and script optimization.                                                                                      |
| [vitest.md](scheduled/vitest.md)                                         | Vitest reliability, performance, coverage, and mock usage.                                                                                                                                   |
| [web-design.md](scheduled/web-design.md)                                 | Frontend design, UX flows, visual consistency, reusable layouts, consistent navigation, design-system adherence, and screenshots for UI changes.                                             |

## Update Checklist

- Add new prompts as standalone Markdown files in [scheduled/](scheduled/).
- Link every prompt from the table above so the rotation set stays reviewable.
- Keep the table in sync with `docs/prompts/scheduled/*.md`; `automation-prompts-scheduled.test.mts`
  checks that every prompt appears exactly once and every link resolves.
- Match linked source-of-truth terminology: use the same words the linked requirement or
  architecture doc uses for a concept, and the exact literal name for a field, route, env var, or
  product constraint (e.g. `UI locale` the concept vs. `ui_locale` the API field).
- Verify linked source-of-truth docs are current before anchoring a prompt to them; if the doc is
  stale, fix the doc first, then add or update the prompt.
- Keep operational rendering rules in [README.md](README.md) and workflow behavior in
  [scheduled-prompts.yml](../../.github/workflows/scheduled-prompts.yml).
