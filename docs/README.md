# Documentation

This index covers all developer-facing documentation for the Voucha monorepo, organized by area.

## Documentation conventions

Index entries link the destination section or document by its title. Do not use generic link labels
such as "Read this section", "click here", or "learn more"; preserve old parent section fragments
with an explicit HTML anchor on the corresponding contents entry when splitting or reorganizing a
document.

Cross-link related docs bidirectionally instead of duplicating their content, and add a compact Mermaid diagram to any doc explaining a complex system (multiple components, async handoffs, or state transitions). Index new agent-facing pages here and in [catalog/README.md](catalog/README.md); `CLAUDE.md` points at the catalog, not each page. Instruction placement (what belongs in `CLAUDE.md` vs a skill vs `docs/**`) is in [CLAUDE.md](CLAUDE.md). See the [agent-workflow skill](../.agents/skills/agent-workflow/implementation.md) and the [docs scheduled prompt](prompts/scheduled/docs.md) for the full convention.

## Development

- [Getting Started](development/README.md) — Local development setup for humans and agents
- [Local Env Vars](development/local-env-vars.md) — Minimal local env var matrix, split by credentials vs. config
- [Local Site Testing Skill](../.agents/skills/local-site-testing/SKILL.md) — Shared Claude and Codex guide for full-site setup, HTTPS Worker access, and local browser validation
- [Agent Workflow & SDLC](../.agents/skills/agent-workflow/SKILL.md) — Shared Claude and Codex workflow: setup, planning, implementation, code review, before-push commands, git, PRs, and SDLC policy
- [Planning Skill](../.agents/skills/planning/SKILL.md) — Shared runtime-neutral planning artifact, impact discovery, independent review, and validated Plan issue contract
- [Retrospective Skill](../.agents/skills/retrospective/SKILL.md) — Shared Claude and Codex retrospective workflow with repository, transcript, and observed CI failure evidence
- [Retrospective Distill Skill](../.agents/skills/retrospective-distill/SKILL.md) — Shared Claude and Codex workflow for turning retrospectives into GitHub issues
- [GitHub Issue Skill](../.agents/skills/github-issue/SKILL.md) — Search, create, classify, verify, update, link, and relate GitHub issues (native sub-issues, blocked-by dependencies)
- [Public Repository Issue Routing](development/public-repository-issue-routing.md) — Live authorization, mutation gates, taxonomy approval, and denied-target tracking behavior
- [Organize GitHub Issues Skill](../.agents/skills/organize-github-issues/SKILL.md) — Apply existing labels and issue priorities to open issues, plus milestones to issues and pull requests, without creating taxonomy
- [Review GitHub Issue Taxonomy Skill](../.agents/skills/review-github-issue-taxonomy/SKILL.md) — Audit labels, milestones, descriptions, colors, and path-label coverage
- [System Dependencies](development/system-dependencies.md) — Voucha's host capability contract and canonical host-setup owner
- [Code Statistics](development/code-statistics.md) — `pnpm run cloc` policy: counted roots, excluded paths, service mapping, and category rules
- [Backend Setup](development/BACKEND-SETUP.md) — Shared secrets, database, Valkey, migrations
- [Monorepo](development/MONOREPO.md) — Monorepo structure and conventions
- [Tests and Checks](development/tests.md) — Local commands for every check (concise, agent-readable)
- [Web Agent Rules](development/web-agent-rules.md) — Navigation, rendering, forms, completeness sweeps, and component/test conventions expanded from `web/CLAUDE.md`
- [CI Reference](development/ci.md) — CI workflow files, configs, coverage thresholds, and workspace matrix
- [Host Locks](development/host-locks.md) — Hosted-runner retirement boundary for repository CI locking and port allocation
- [Merge Authority](development/merge-authority.md) — Env-aware merge-policy hook (blocked in GitHub Actions, human-confirmed interactively), automation PR labeling, and the #7848 bypass-actor residual
- [Agent Sandbox](development/agent-sandbox.md) — OS-level sandbox containment model for Claude and Codex, per-command bypass rationale (gh/docker/pnpm/git), and why the credentialed-CI threat is already contained
- [Agent Harness Parity](development/agent-harness-parity.md) — Claude vs Codex vs Grok vs Cursor vs OpenCode capability map; Grok reuses Claude-compat, Cursor uses native `.cursor/` adapters, OpenCode reads `CLAUDE.md` without copied hooks
- [First-Party Dependencies](development/first-party-dependencies.md) — Package → upstream repo map for packages authored by Jonathan Ong
- [Documentation Moved to vouchington-docs](development/docs-moved-to-vouchington-docs.md) — Registry of paths deliberately absent from this repo, where each went, and why
- [Finite Enum Ripple Checklist](development/finite-enum-ripple-checklist.md) — Required scan surfaces for topic type, post type, route slug, and other closed-string-set removals or renames
- [PostgreSQL Schema Quality Rules](development/postgres-schema-rules.md) — FK indexing, redundant indexes, STORED-column recompute, score typing, and replica-write rules
- [Checklists Index](checklists/README.md) — Lifecycle and edit checklists for commits, packages, CI, infrastructure, and backend queues
- [Commit Checklist](checklists/commit.md) — Format, lint, commit-message, and file-size rules before committing
- [package.json Checklist](checklists/package-json.md) — Version policy, pnpm, lockfile, and new-service registration
- [Native Parity Interactions](checklists/native-parity-interactions.md) — Native list/detail interaction checks, pagination cursors, and visibility gates
- [Parser and Library Swap Checklist](checklists/parser-library-swap.md) — Characterization tests and migration order for parser/tokenizer/library replacements
- [GitHub Actions Checklist](checklists/github-actions.md) — Runner preference, pinning, concurrency, and docs-sync rules
- [Review CI Logs Skill](../.agents/skills/review-ci-logs/SKILL.md) — Audit CI failures, misleading warning/error output, and excessive logs without hiding diagnostics
- [Backend Queue Authoring Checklist](checklists/backend-queues.md) — Queue/worker ownership, replayability, scheduling, backfills, and validation
- [Codex Prompts](prompts/README.md) — Scheduled and GitHub Actions automation prompt templates
- [Scheduled Prompt Catalog](prompts/SCHEDULED.md) — Scheduled automation prompts and their scope
- [Agent Sandbox Policy Prompt](prompts/scheduled/agent-sandbox-policy.md) — Scheduled audit of agent sandbox and permission configuration for staleness, breadth drift, and cross-harness parity
- [CI Job Runtime Prompt](prompts/scheduled/ci-job-runtime.md) — Scheduled audit of successful CI-job runtime budgets
- [CI Log Quality Prompt](prompts/scheduled/ci-log-quality.md) — Scheduled diagnostics-preserving CI-log review
- [First-Party Dependencies Prompt](prompts/scheduled/first-party-dependencies.md) — Scheduled first-party dependency ownership audit
- [Transient Retry Prompt](prompts/scheduled/transient-retry.md) — Scheduled CI retry root-cause and rule-retirement audit
- [Codex main-branch fix prompt](prompts/automation/fix-main.md)
- [Supply-chain security prompt](prompts/scheduled/supply-chain-security.md)
- [UI internationalization prompt](prompts/scheduled/ui-internationalization.md)
- [Dependency Updates](development/dependency-updates.md) — Coverage matrix for Dependabot and Renovate, Knip dependency-hygiene workflow, docs pinning policy, plus how to add a new pinned binary
- [Native TLS Pinning Runbook](runbooks/native-tls-pinning.md) — Cloudflare edge SPKI pin rollout and rotation for native API clients
- [Git Worktree Locks](development/git-worktree-locks.md) — Diagnosing and fixing `index.lock` collisions caused by git auto-maintenance
- [Worker Performance](development/worker-performance.md) — Sizing, concurrency knobs, Rust N-API libuv pool caps, and profiling for the backend worker process
- [Runtime Timeouts](development/runtime-timeouts.md) — Registry of server/worker/dispatcher/Lambda/SSE timeouts by category, plus the Fargate Spot SSE short-cap principle
- [Structured Decisions](overview/architecture/structured-decisions.md) — Strict Jev Noul, Choice, and Score transport boundary
- [OpenTelemetry](development/opentelemetry.md) — Local distributed tracing (collector + Jaeger) and AWS deploy path (ADOT → X-Ray)
- [Agent Blackboard](development/agent-blackboard.md) — Hosted Lambda + DynamoDB session store for agent session journaling and retrospectives (local dev only today; CI wiring is not yet provisioned)
- [Harness Engineering](development/harness-engineering.md) — Agent observability plan using CI-main Sentry, local/CI Playwright OTel, S3 trace dumps, and Sentry MCP

### Focused development references

- [Adding a Trusted/Credentialed CI Job](development/reference-ci-adding-a-trusted-credentialed-ci-job.md)
- [CI Job Conditions](development/reference-ci-ci-job-conditions.md)
- [CI Job Timeout Budgets](development/reference-ci-ci-job-timeout-budgets.md)
- [Classifying Transient Infrastructure Failures](development/reference-ci-classifying-transient-infrastructure-failures.md)
- [Coverage Gates](development/reference-ci-coverage-gates.md)
- [Coverage Provenance and Transport](development/reference-ci-coverage-provenance-and-transport.md)
- [Destructive Manual Workflows](development/reference-ci-destructive-manual-workflows.md)
- [Diagnosing Binary Download Failures](development/reference-ci-diagnosing-binary-download-failures.md)
- [Playwright CI Selection](development/reference-ci-playwright-ci-selection.md)
- [Standalone Workflow Checks](development/reference-ci-standalone-workflow-checks.md)
- [Static Analysis (`static-code-analysis.yml`)](development/reference-ci-static-analysis-static-code-analysis-yml.md)
- [Test Workflows](development/reference-ci-test-workflows.md)
- [Vitest CI Selection](development/reference-ci-vitest-ci-selection.md)
- [Workflow Topology Contracts](development/reference-ci-workflow-topology-contracts.md)
- [Workspace Cross-Reference](development/reference-ci-workspace-cross-reference.md)
- [Dependabot auto-merge](development/reference-dependency-updates-dependabot-automerge.md)
- [Adding a new pinned binary](development/reference-dependency-updates-adding-a-new-pinned-binary.md)
- [Coverage matrix](development/reference-dependency-updates-coverage-matrix.md)
- [First-party release-gate exemptions](development/reference-dependency-updates-first-party-release-gate-exemptions.md)
- [Frozen-install policy](development/reference-dependency-updates-frozen-install-policy.md)
- [Manually maintained pins](development/reference-dependency-updates-manually-maintained-pins.md)
- [Docs pinning policy](development/dependency-updates.md#docs-pinning-policy)
- [Pinning style for GitHub Actions](development/reference-dependency-updates-pinning-style-for-github-actions.md)
- [Related](development/reference-dependency-updates-related.md)
- [Supply-chain policy](development/reference-dependency-updates-supply-chain-policy.md)
- [Verifying a Renovate change](development/reference-dependency-updates-verifying-a-renovate-change.md)
- [Accepted automation CI risk](development/reference-merge-authority-accepted-automation-ci-risk.md)
- [Automation PR labeling](development/reference-merge-authority-automation-pr-labeling.md)
- [Decision flow](development/reference-merge-authority-decision-flow.md)
- [See also](development/reference-merge-authority-see-also.md)
- [Why "automation" means GitHub Actions](development/reference-merge-authority-why-automation-means-github-actions.md)
- [Backend Package Scopes](development/reference-monorepo-backend-package-scopes.md)
- [Cross-References](development/reference-monorepo-cross-references.md)
- [Global vs. Project Commands](development/reference-monorepo-global-vs-project-commands.md)
- [Primary Packages](development/reference-monorepo-primary-packages.md)
- [Test And Tooling Directories](development/reference-monorepo-test-and-tooling-directories.md)
- [Classification](development/reference-runtime-timeouts-classification.md)
- [Crash-recovery / stall windows](development/reference-runtime-timeouts-crash-recovery.md)
- [Cross-tier observation](development/reference-runtime-timeouts-cross-tier-observation.md)
- [Follow-ups](development/reference-runtime-timeouts-follow-ups.md)
- [Infra](development/reference-runtime-timeouts-infra.md)
- [Node HTTP server](development/reference-runtime-timeouts-node-http-server.md)
- [Principle: SSE / long-lived connection duration under Fargate Spot](development/reference-runtime-timeouts-principle-sse-long-lived-connection-duration-under-fargate-spot.md)
- [Regression coverage](development/reference-runtime-timeouts-regression-coverage.md)
- [Runtime Timeouts — Related](development/reference-runtime-timeouts-related.md)
- [Shared undici dispatchers](development/reference-runtime-timeouts-shared-undici-dispatchers.md)
- [SSE compliance status](development/reference-runtime-timeouts-sse-compliance-status.md)
- [Tunable performance knobs](development/reference-runtime-timeouts-tunable-knobs.md)
- [Vendored](development/reference-runtime-timeouts-vendored.md)
- [CLAUDE.md and AGENTS.md Size Cap](development/reference-tests-claude-md-and-agents-md-size-cap.md)
- [Test Command Matrix](development/reference-tests-command-matrix.md)
- [E2E and Visual](development/reference-tests-e2e-and-visual.md)
- [First-Push Deterministic Preflight](development/reference-tests-first-push-deterministic-preflight.md)
- [Linters and Static Analysis](development/reference-tests-linters-and-static-analysis.md)
- [Local Patch Coverage Preview](development/reference-tests-local-patch-coverage-preview.md)
- [Test Value and Safe Reduction](development/reference-tests-value-and-reduction.md)
- [Local Web Validation Recovery](development/reference-tests-local-web-validation-recovery.md)
- [Parallel-Safety and Test-Root Hygiene](development/reference-tests-parallel-safety-and-test-root-hygiene.md)
- [Playwright Matchers and Helpers](development/reference-tests-playwright-matchers-and-helpers.md)
- [Schema Checks](development/reference-tests-schema-checks.md)
- [Smoke Tests](development/reference-tests-smoke-tests.md)
- [Storybook A11y Exceptions](development/reference-tests-storybook-a11y-exceptions.md)
- [Translation Catalog and Locale Checks](development/reference-tests-translation-catalog-and-locale-checks.md)
- [Vitest Mock Typing](development/reference-tests-vitest-mock-typing.md)
- [Vitest Projects](development/reference-tests-vitest-projects.md)
- [Vitest 5 Pool and Isolate Matrix](development/reference-tests-vitest-5-pool-matrix.md)
- [Explain test selection and Vitest ownership](development/reference-explain-test-selection-and-vitest-ownership.md)
- [DynamicConfig cleanup](development/reference-dynamicconfig-cleanup.md)
- [Project name reference](development/reference-project-name-reference.md)
- [Vitest Worker-Exit Diagnostics](development/reference-vitest-worker-exit-diagnostics.md)
- [Concurrency model](development/reference-worker-performance-concurrency-model.md)
- [Native thread pools](development/reference-worker-performance-native-thread-pools.md)
- [Node process knobs](development/reference-worker-performance-node-process-knobs.md)
- [Profiling](development/reference-worker-performance-profiling.md)
- [Worker Performance — Related](development/reference-worker-performance-related.md)
- [Sizing target](development/reference-worker-performance-sizing-target.md)
- [Valkey Inflight Saturation (issue #4717)](development/reference-worker-performance-valkey-inflight-saturation-issue-4717.md)
- [Verifying changes](development/reference-worker-performance-verifying-changes.md)

### Focused checklists references

- [Financial Stripe variant](checklists/reference-financial-stripe-variant.md)
- [Define a replay-safe job](checklists/reference-backend-queues-define-a-replay-safe-job.md)
- [Durable transition matrix](checklists/reference-backend-queues-durable-transition-matrix.md)
- [Place each responsibility](checklists/reference-backend-queues-place-each-responsibility.md)
- [Schedulers, flows, and backfills](checklists/reference-backend-queues-schedulers-flows-and-backfills.md)
- [See also](checklists/reference-backend-queues-see-also.md)
- [Test and document](checklists/reference-backend-queues-test-and-document.md)

## Overview

How the system works — architecture, pipelines, and infrastructure.

- [Overview Index](overview/README.md) — architecture and infrastructure subdirectories

### Architecture

- [API Egress Proxy](overview/architecture/api-egress-proxy.md) — Provider-scoped HTTP CONNECT routing from IPv6-only API tasks
- [Auth Overview](overview/architecture/auth-overview.md) — Authentication architecture and flows
- [Request Client Information](overview/architecture/request-client-info.md) — First-party API metadata validation and request-scoped propagation
  - [Session JWT service](../backend/services/jwt-session/README.md) — JWT signing, verification, cookie management
  - [Shared session JWT](../ts-shared/session-jwt/README.md) — Shared JWT types and helpers
- [App Attest](overview/architecture/app-attestation.md) — Apple App Attest key/assertion ceremonies, Turnstile bypass decision path, `dc`-claim 30-day session extension, replay defenses
  - [App Attestation service](../backend/services/app-attestation/README.md) — Verification internals, DB schema, boundary rules
  - [App Attestation API routes](../backend/api/v1/app-attestation/README.md) — Request/response shapes, rate limits
- [Error Handling](overview/architecture/error-handling.md) — Error response contract, code registry, propagation chain, security policy
- [Caching Strategy](overview/architecture/caching-strategy.md) — 3-tier caching architecture (CloudFront, CF Worker, Valkey)
  - [Anonymous HTML edge caching vs. CSP nonces](overview/architecture/anon-html-edge-caching-csp.md) — why anon HTML is cacheable at the edge despite the per-request CSP nonce; placeholder-nonce mitigation and its safety properties
- [Rate Limiting](overview/architecture/rate-limiting.md) — 3-layer rate limiting: edge IP, per-endpoint, and user-aware trust tier
- [CAPTCHA & Bot Protection](overview/architecture/captcha.md) — Turnstile (hard gate) + reCAPTCHA Enterprise (invisible score) matrix, check order, configs
- [Analytics Pipeline](overview/architecture/analytics-pipeline.md) — Local JSONL + DuckDB analytics, table registry, env vars, Phase 3 Firehose plan
- [Content Rendering](overview/architecture/content-rendering.md) — Post rendering rules, image proxying, mention parsing
  - [Markdown service](../backend/services/markdown/README.md) — Rust-backed markdown rendering pipeline
  - [HTML & Markdown Rendering Passes](overview/architecture/html-markdown-rendering-passes.md) — Multi-pass rendering pipeline for safe HTML and Markdown output
- [Partitioning Strategy](overview/architecture/partitioning-strategy.md) — When and how to partition PostgreSQL tables
- [Partition Pruning Hints](overview/architecture/partition-pruning-hints.md) — UUIDv7 temporal ordering constraints for PostgreSQL RANGE partitions
- [AI Agents](overview/architecture/ai-agents.md) — LLM moderation pipeline, semantic embeddings, agent conversations
  - [Shared agent utilities](../backend/agents/_shared/README.md) — `runToolLoop`, `createSubagentTool`, `buildAgentTools` API reference
  - [Spam detection service](../backend/services/spam-detection/README.md) — ML-based spam detection pipeline
- [Bedrock Embeddings](overview/architecture/bedrock-embeddings.md) — Dual-pipeline embeddings architecture: real-time single queue and Bedrock batch API, dedup contract, race outcomes
- [Event Ingress Routing](overview/architecture/event-ingress.md) — Canonical rule for routing inbound AWS events and webhooks: in-VPC enqueue-only Lambda vs. public endpoint, the self-contained-auth test, and the real-time (push/long-poll only) requirement
- [.NET Deep Linking](https://github.com/vouchington/vouchington-clients/blob/main/docs/architecture/dotnet-deep-linking.md) — MAUI protocol activation, shell routing, and native login-link handling
- [Crawling](overview/architecture/crawling.md) — HTML/RSS crawl pipeline, rate limiting, scheduling, blacklist, robots.txt
- [Search](overview/architecture/search.md) — Hybrid full-text + vector search, filters, sort modes, pagination
- [Cursor Pagination](overview/architecture/pagination.md) — Required API, query, web, Swift, and .NET list contract
- [Monetary Values](overview/architecture/monetary-values.md) — Currency catalog, integer storage, public money types, exact parsing, aggregation, and provider boundaries
- [Fediverse Federation](overview/architecture/fediverse-federation.md) — Shipped A→D roadmap (search, instance directory, outbound ActivityPub, Bluesky linking and follows), protocol reality, and reuse-mapping table
- [Notifications Architecture](overview/architecture/notifications.md) — Subscription rules, manual sends, browser push delivery
- [Sitemaps](overview/architecture/sitemaps.md) — XML sitemap generation, S3 upload, eligibility rules
- [Feeds](overview/architecture/feeds.md) — Personalized post and RSS item feed queries
- [Dynamic Config](overview/architecture/dynamic-config.md) — Admin-managed Valkey DynamicConfig namespaces, authorization hooks, and audit history
- [Feature Flags](overview/architecture/feature-flags.md) — Runtime feature toggles via Valkey DynamicConfig
  - [Feature flags service](../backend/services/feature-flags/README.md) — DynamicConfig implementation
- [Conversations](overview/architecture/conversations.md) — LLM agentic chat sessions and message storage
- [Entity Relations](overview/architecture/entity-relations.md) — Follow, mute, block, and subscription relationships
- [Bookmarks](overview/architecture/bookmarks.md) — User bookmark system with bloom filter optimization
- [Post Lifecycle](overview/architecture/post-lifecycle.md) — Post creation, async fan-out, moderation, and sitemap updates
- [TypeScript Standards](overview/architecture/typescript-standards.md) — Type-level and code-style conventions
  - [Explicit Resource Management](overview/architecture/reference-typescript-standards-resource-management.md) — Lexical ownership criteria and async-disposal exclusions
- [Google Tag Manager](overview/architecture/gtm.md) — Server-side GTM proxy architecture, setup, and custom events
- [Graceful Shutdown](overview/architecture/graceful-shutdown.md) — Backend process shutdown sequence, signal handling, and drain order
- [PostgreSQL Data Store](../backend/data-stores/psql/README.md) — Connection pools, query helpers, transactions, migrations, and EXPLAIN tooling
  - [EXPLAIN ANALYZE tooling](../backend/scripts/explain-analyze/README.md) — Seed, capture, analyze, and dump query plans
- [Valkey Data Store](../backend/data-stores/valkey/README.md) — Valkey/Redis client, key conventions, bloom filters, rate limiting
- [Agent Tools](overview/architecture/agent-tools/README.md) — LLM tool registry: surfaces (internal, MCP, iOS client), type definitions, and tool implementation reference

### Infrastructure

- [Infrastructure](overview/infrastructure/infrastructure.md) — AWS resources: ECS, Aurora, Valkey, CloudFront, S3, SES
- [S3 Buckets × Lifecycle Matrix](overview/infrastructure/s3-buckets.md) — Bucket purposes, encryption, and lifecycle/retention rules
- [Deployment](overview/infrastructure/deployment.md) — Platform, Docker images, CI/CD flow, traffic routing, provisioning checklist
- [SOCI Lazy Loading](overview/infrastructure/soci-lazy-loading.md) — Infra-side SOCI v2 index generation for Fargate lazy loading, decision rationale, architecture, and operations
- [Networking](overview/infrastructure/networking.md) — VPC topology, public IPv4 cost model, and egress design decisions
- [Env Var Contract](overview/infrastructure/env-var-contract.md) — Filaments-owned typed env-var metadata for config-inventory and deployment handoffs
- [Environment Variables](overview/infrastructure/environment-variables.md) — Complete inventory of all env vars by category

### Focused architecture references

- [Content Moderation Pipeline](overview/architecture/reference-ai-agents-content-moderation-pipeline.md)
- [CRM Outreach Agent (`@agents/crm-outreach`)](overview/architecture/reference-ai-agents-crm-outreach-agent-agents-crm-outreach.md)
- [LLM Agent Conversations](overview/architecture/reference-ai-agents-llm-agent-conversations.md)
- [Semantic Search (Embeddings)](overview/architecture/reference-ai-agents-semantic-search-embeddings.md)
- [Systems Overview](overview/architecture/reference-ai-agents-systems-overview.md)
- [Code entry points](overview/architecture/reference-analytics-pipeline-code-entry-points.md)
- [Analytics Pipeline Environment Variables](overview/architecture/reference-analytics-pipeline-environment-variables.md)
- [Retention](overview/architecture/reference-analytics-pipeline-retention.md)
- [Table registry](overview/architecture/reference-analytics-pipeline-table-registry.md)
- [Configuration](overview/architecture/reference-app-attestation-configuration.md)
- [Session Duration (the `dc` claim)](overview/architecture/reference-app-attestation-session-duration-the-dc-claim.md)
- [Supported Devices](overview/architecture/reference-app-attestation-supported-devices.md)
- [Two Ceremonies](overview/architecture/reference-app-attestation-two-ceremonies.md)
- [Login Flows](overview/architecture/reference-auth-overview-login-flows.md)
- [Multi-Factor Authentication](overview/architecture/reference-auth-overview-multi-factor-authentication.md)
- [Security Recommendations](overview/architecture/reference-auth-overview-security-recommendations.md)
- [Server-Side Auth](overview/architecture/reference-auth-overview-server-side-auth.md)
- [Stateless Session Architecture](overview/architecture/reference-auth-overview-stateless-session-architecture.md)
- [Valkey State](overview/architecture/reference-auth-overview-valkey-state.md)
- [Web Client Auth Boundary](overview/architecture/reference-auth-overview-web-client-auth-boundary.md)
- [Architecture Overview](overview/architecture/reference-caching-strategy-architecture-overview.md)
- [Cache Tiers](overview/architecture/reference-caching-strategy-cache-tiers.md)
- [Tier 1: CF Worker Edge Cache (Workers Cache)](overview/architecture/reference-tier-1-cf-worker-edge-cache-workers-cache.md)
- [Bot Tiers](overview/architecture/reference-bot-tiers.md)
- [Origin and Browser `Vary` Boundaries](overview/architecture/reference-origin-and-browser-vary-boundaries.md)
- [Navigation Performance](overview/architecture/reference-navigation-performance.md)
- [Tier 2: Backend HTTP Cache-Control](overview/architecture/reference-tier-2-backend-http-cache-control.md)
- [Tier 3: Backend Valkey Cache](overview/architecture/reference-tier-3-backend-valkey-cache.md)
- [Client-Side Personalization](overview/architecture/reference-caching-strategy-client-side-personalization.md)
- [Components](overview/architecture/reference-crawling-components.md)
- [Crawling Error Handling](overview/architecture/reference-crawling-error-handling.md)
- [Referral Link Crawling](overview/architecture/reference-crawling-referral-link-crawling.md)
- [Client-Side `onError` (`web/lib/on-error/`)](overview/architecture/reference-error-handling-client-side-onerror-web-lib-on-error.md)
- [Crawler Error Auto-Disable](overview/architecture/reference-error-handling-crawler-error-auto-disable.md)
- [Error Response Contract](overview/architecture/reference-error-handling-error-response-contract.md)
- [Precondition Errors and Action-Oriented Modals](overview/architecture/reference-error-handling-precondition-errors-and-action-oriented-modals.md)
- [Server-Side Error Boundaries](overview/architecture/reference-error-handling-server-side-error-boundaries.md)
- [Constraints that bind every phase](overview/architecture/reference-fediverse-federation-constraints-that-bind-every-phase.md)
- [Phase C — Outbound ActivityPub (resurrect the removed federation server) — Shipped](overview/architecture/reference-fediverse-federation-phase-c-outbound-activitypub-resurrect-the-removed-federation-server-shipped.md)
- [Phase D — Bluesky account-linking and follow propagation — Shipped](overview/architecture/reference-fediverse-federation-phase-d-bluesky-account-linking-and-follow-propagation-shipped.md)
- [Protocol reality](overview/architecture/reference-fediverse-federation-protocol-reality.md)
- [Current Footprint](https://github.com/vouchington/vouchington-clients/blob/main/docs/architecture/native-clients.md)
- [Spending category management](overview/architecture/reference-native-clients-spending-category-management.md)
- [Comment-Specific Behavior](overview/architecture/reference-post-lifecycle-comment-specific-behavior.md)
- [Community Moderation Pipeline](overview/architecture/reference-post-lifecycle-community-moderation-pipeline.md)
- [Key Files](overview/architecture/reference-post-lifecycle-key-files.md)
- [Post Creation Pipeline](overview/architecture/reference-post-lifecycle-post-creation-pipeline.md)
- [Story Post Behavior](overview/architecture/reference-post-lifecycle-story-post-behavior.md)
- [Public Post Eligibility](overview/architecture/reference-post-lifecycle-public-eligibility.md)
- [Table of Contents](overview/architecture/reference-post-lifecycle-table-of-contents.md)
- [Creation Gates](overview/architecture/reference-rate-limiting-creation-gates.md)
- [Layer 1: Cloudflare Worker (Edge)](overview/architecture/reference-rate-limiting-layer-1-cloudflare-worker-edge.md)
- [Layer 3: User-Aware Trust Tier (Backend)](overview/architecture/reference-rate-limiting-layer-3-user-aware-trust-tier-backend.md)
- [Layer 4: Per-Route Rate Limiting (Backend)](overview/architecture/reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md)
- [Encoding Invariants Structurally](overview/architecture/reference-typescript-standards-encoding-invariants-structurally.md)
- [Explicit Resource Management](overview/architecture/reference-typescript-standards-resource-management.md)
- [Function Naming Prefixes](overview/architecture/reference-typescript-standards-function-naming-prefixes.md)
- [Third-Party Type Declarations](overview/architecture/reference-typescript-standards-third-party-type-declarations.md)
- [Type Ownership Model](overview/architecture/reference-typescript-standards-type-ownership-model.md)

### Focused infrastructure references

- [CI/CD Flow](overview/infrastructure/reference-deployment-ci-cd-flow.md)
- [First-Time Provisioning Checklist](overview/infrastructure/reference-deployment-first-time-provisioning-checklist.md)
- [Platform](overview/infrastructure/reference-deployment-platform.md)
- [S3 Static Assets](overview/infrastructure/reference-deployment-s3-static-assets.md)
- [AI / ML](overview/infrastructure/reference-environment-variables-ai-ml.md)
- [Analytics Pipeline — Environment Variables](overview/infrastructure/reference-environment-variables-analytics-pipeline.md)
- [Authentication](overview/infrastructure/reference-environment-variables-authentication.md)
- [AWS S3 Storage](overview/infrastructure/reference-environment-variables-aws-s3-storage.md)
- [Bluesky (AT Protocol)](overview/infrastructure/reference-environment-variables-bluesky-at-protocol.md)
- [Bot Protection (reCAPTCHA Enterprise)](overview/infrastructure/reference-environment-variables-bot-protection-recaptcha-enterprise.md)
- [Bot Protection (Turnstile)](overview/infrastructure/reference-environment-variables-bot-protection-turnstile.md)
- [Browser Crawl (Lightpanda)](overview/infrastructure/reference-environment-variables-browser-crawl-lightpanda.md)
- [Cloudflare Worker](overview/infrastructure/reference-environment-variables-cloudflare-worker.md)
- [Email (SES)](overview/infrastructure/reference-environment-variables-email-ses.md)
- [Feature Flags Environment Variables](overview/infrastructure/reference-environment-variables-feature-flags.md)
- [Monitoring](overview/infrastructure/reference-environment-variables-monitoring.md)
- [Native App Attestation](overview/infrastructure/reference-environment-variables-native-app-attestation.md)
- [OAuth Providers](overview/infrastructure/reference-environment-variables-oauth-providers.md)
- [Payments (Stripe)](overview/infrastructure/reference-environment-variables-payments-stripe.md)
- [Payments (Apple App Store)](overview/infrastructure/reference-environment-variables-payments-apple-app-store.md)
- [Payments (Google Play)](overview/infrastructure/reference-environment-variables-payments-google-play.md)
- [Google Play recovery](../backend/queues/memberships/reference-google-play-recovery.md)
- [Payments (Microsoft Store)](overview/infrastructure/reference-environment-variables-payments-microsoft-store.md)
- [Push Notifications](overview/infrastructure/reference-environment-variables-push-notifications.md)
- [Server Configuration](overview/infrastructure/reference-environment-variables-server-configuration.md)
- [Sideload Image Security](overview/infrastructure/reference-environment-variables-sideload-image-security.md)
- [Typed Contract Coverage](overview/infrastructure/reference-environment-variables-typed-contract-coverage.md)
- [Web Build-Time And Runtime-Public Config](overview/infrastructure/reference-environment-variables-web-build-time-and-runtime-public-config.md)
- [Infrastructure Architecture Overview](overview/infrastructure/reference-infrastructure-architecture-overview.md)
- [S3 Buckets](overview/infrastructure/reference-infrastructure-s3-buckets.md)
- [AWS Application Endpoint Inventory](overview/infrastructure/reference-networking-aws-application-endpoint-inventory.md)
- [Decision: Per-Task IP vs. Managed NAT Gateway](overview/infrastructure/reference-networking-decision-per-task-ip-vs-managed-nat-gateway.md)
- [Production Server External API Inventory](overview/infrastructure/reference-networking-production-server-external-api-inventory.md)
- [Status Summary](overview/infrastructure/reference-networking-status-summary.md)
- [Table A — Buckets × purpose & configuration](overview/infrastructure/reference-s3-buckets-table-a-buckets-purpose-configuration.md)
- [Table B — Buckets × lifecycle (post cost-review rules)](overview/infrastructure/reference-s3-buckets-table-b-buckets-lifecycle-post-cost-review-rules.md)

## Requirements

Feature specifications, rules, and policies.

- [Index](requirements/README.md) — Requirements index
- [Entity Anatomy](requirements/anatomy/README.md) — per-entity data shape, lifecycle states, surfaces, and actions
- [Client Parity Matrix](requirements/CLIENT-PARITY-MATRIX.md) — Web vs. Swift vs. .NET rendered functional UI parity and active shared gaps
- [Client Feature Parity Contract](requirements/client-feature-parity.json) — Machine-readable capability requirements, source/test evidence, statuses, and issue ownership
- [Entity × Action Matrix](requirements/ENTITY-ACTION-MATRIX.md) — Cross-cut reference: entity × surface × action (Table A) and entity × action × description (Table B); known gaps
- [Entity × Lifecycle Flow Matrix](requirements/ENTITY-LIFECYCLE-MATRIX.md) — Create, Edit, Delete, Archive, Approve flows per entity with authorization tiers and page/component entry points; known gaps
- [Admin Navigation Matrix](requirements/ADMIN-NAVIGATION-MATRIX.md) — Admin-only entity pages, actions, and navigation paths (sidebar, command palette, per-entity asides); known gaps
- [URL-Routable Entity Catalog](requirements/ENTITIES.md) — Canonical entity → URL helper mapping; tracks which entities have helpers and which are gaps
- [App Navigation](requirements/navigation/APP-NAVIGATION.md) — native app bottom bar, verticals, sub-options, omnisearch, customization
- [Routes](requirements/navigation/ROUTES.md) — Route structure and navigation
- [Posts](requirements/content/POSTS.md) — Post creation and display
- [Review Succession](requirements/content/reference-post-lifecycle-review-succession.md) — Exact-topic review replacement, provenance, recovery, and locking semantics
- [Fediverse](requirements/content/FEDIVERSE.md) — Feature-flagged search intent, provider buckets, current boundaries, and the planned A→D federation roadmap
  - [Fediverse Federation architecture](overview/architecture/fediverse-federation.md) — technical design for the roadmap's four phases
- [Comments](requirements/content/COMMENTS.md) — Comment system requirements
- [Chat](requirements/content/CHAT.md) — AI chat routes, SSE contract, no-refresh invariant, and scroll rules
- [Topics](requirements/content/TOPICS.md) — Topic management
- [Users](requirements/users/USERS.md) — User profile routes, tabs, and management views
- [User Relation Matrix](requirements/users/USER-RELATION-MATRIX.md) — User bookmark relation management on profile pages
- [User Privacy Feature Matrix](requirements/users/USER-PRIVACY-MATRIX.md) — User privacy, consent, data rights, and coverage matrix
- [Lists](requirements/content/LISTS.md) — User-curated named collections of articles, podcast episodes, videos, and posts; schema, service, API, and phased roadmap
- [Podcasts](requirements/content/PODCASTS.md) — Podcast hub routes, Apple iTunes category parsing, player architecture, and Swift REST contract
- [Tags](requirements/content/TAGS.md) — Tagging system
- [Sidebar](requirements/navigation/SIDEBAR.md) — Sidebar navigation
- [Navigation](requirements/navigation/NAVIGATION.md) — Intent-based navigation: vocabulary, taxonomy, route→intent resolution, and visibility rules
- [Client Intent Parity](requirements/navigation/CLIENT-INTENT-PARITY.md) — Web header and native bottom/tab intent contract across clients
- [Top Bar Search](requirements/navigation/TOPBAR-SEARCH.md) — Search functionality
- [Feed And List Filters](requirements/navigation/FEED-LIST-FILTERS.md) — Feed/post/news filter controls, combined `#topic` search, community labels, and responsive dropdown rules
- [Actions](requirements/navigation/ACTIONS.md) — Action button principles, placement rules, and tooltip requirements
- [Signed-out Actions](requirements/navigation/SIGNED_OUT_ACTIONS.md) — Which buttons are visible to anonymous users and what happens on click
- [Entity × Action Icons](requirements/navigation/ENTITY-ACTION-ICONS.md) — Canonical icon choices for user-facing entity/action controls
- [Asides](requirements/navigation/ASIDES.md) — per-page right sidebar content
- [Accessibility](requirements/navigation/ACCESSIBILITY.md) — WCAG 2.2 compliance requirements
- [Dynamic Rendering](requirements/navigation/DYNAMIC-RENDERING.md) — SSR vs streaming pattern for logged-out/logged-in users
- [Mobile Responsiveness](requirements/navigation/MOBILE.md) — Mobile responsiveness requirements
- [User Preferences](requirements/users/PREFERENCES.md) — localStorage-based preference system and theme architecture
- [Localization](requirements/users/LOCALIZATION.md) — UI locale, account country, content language, and future translation requirements
- [User Settings](requirements/users/USER_SETTINGS.md) — User preferences and settings
- [Communities](requirements/community/COMMUNITIES.md) — Community creation, naming/slug rules, and archiving
- [Community Lists](requirements/community/community-lists.md) — Curated lists of topics, RSS feeds, posts, domains, and URLs; proxy follow/mute
- [CRM](requirements/admin/CRM.md) — Internal admin tool for influencer outreach and contact relationships
- [Customer Support](requirements/admin/CUSTOMER-SUPPORT.md) — Support procedures and related agent behavior
- [RSS Feed Category Aliases](requirements/content/RSS-FEED-CATEGORY-ALIASES.md) — Admin triage tool for unmapped RSS feed item categories
- [RSS Feed Crawling](requirements/content/RSS-FEED-CRAWLING.md) — Prioritized, tiered crawl scheduling: score formula, tier SLAs, materialized-view tiering refreshed via the psql `refreshMaterializedView` job, DynamicConfig reference
- [Growth Dashboard](requirements/admin/GROWTH-DASHBOARD.md) — Admin/investor KPI dashboard with user growth, content, engagement, network effects, revenue, and infrastructure metrics
- [API Performance](requirements/platform/api-performance.md) — Performance conventions for all backend API routes
- [Job Replayability & Idempotency](requirements/platform/JOB-REPLAYABILITY.md) — idempotency standard, backfill registry, and per-queue replayability matrix for glide-mq jobs
- [Email Classification](requirements/platform/email-classification.md) — transactional vs. marketing classification registry, SES config set isolation, bounce suppression, CAN-SPAM footer
- [Memberships](requirements/users/memberships.md) — Plans, billing, Stripe integration, admin grants
- [API Keys](requirements/users/api-keys.md) — API key system, permissions, RSS feed access, rate limits
- [Data Points Spec](requirements/platform/data-points-spec.md) — Structured data point schemas per vertical, aggregation views, data quality rules
- [Referral Links](requirements/users/REFERRAL-LINKS.md) — Referral link submission, ranking, and click attribution
- [Landing Pages](requirements/users/LANDING-PAGES.md) — Item selection, draft persistence, refresh merging, and page switching across clients
- [Notification Requirements](requirements/navigation/NOTIFICATIONS.md) — Browser push notifications, in-app notification UI
- [News & Discussions](requirements/content/NEWS-DISCUSSIONS.md) — News/discussion feeds, RSS item modals
- [Stories](requirements/content/stories.md) — Story clustering for RSS feed items, official sources, admin management
- [News Story Clusters](requirements/content/news-story-clusters.md) — News cluster data model: per-item and full-story discussion paths, and `@story-teller` agent integration
- [Privacy](requirements/users/PRIVACY.md) — Post privacy levels and broadcast audience controls
- [Sources & Domains](requirements/content/SOURCES-DOMAINS.md) — RSS source directory and domain pages
- [Keyboard Shortcuts](requirements/navigation/KEYBOARD-SHORTCUTS.md) — Keyboard shortcuts
- [Landing Page Analytics](requirements/admin/LANDING-PAGE-ANALYTICS.md) — Landing page performance analytics for landing page owners
- [Trust System](requirements/trust-safety/trust-system.md) — Phased trust/reputation design, vote weight calibration, contribution gating, bot defense
- [Community Moderation](requirements/moderation/community-moderation.md) — Community post review, moderator prompts, and enforcement flow
- [Post Moderation](requirements/moderation/POST-MODERATION.md) — Roles, authorization matrix, action semantics, API routes, audit trail, and known gaps
- [Moderation Policy Matrix](requirements/moderation/MODERATION-POLICY-MATRIX.md) — Canonical policy keys, labels, severity, and recommended actions
- [Moderation Flows](requirements/moderation/MODERATION-FLOWS.md) — Canonical moderation pipeline and subsystem index
- [Review Disputes](requirements/moderation/REVIEW-DISPUTES.md) — Verified-claimant legal dispute flow for reviews
- [Moderation Appeals](requirements/moderation/MODERATION-APPEALS.md) — Member appeals for bans, warnings, and post removals
- [Reporting](requirements/moderation/REPORTING.md) — User report/flag flow, entity types, reason codes, and moderation queue
- [Community Bans](requirements/moderation/COMMUNITY-BANS.md) — Community-scoped ban lifecycle and enforcement
- [Community Restrictions](requirements/moderation/COMMUNITY-RESTRICTIONS.md) — Raid mode and temporary community restrictions
- [User Warnings](requirements/moderation/USER-WARNINGS.md) — Warning records and report linkage
- [Moderator Notes](requirements/moderation/MOD-NOTES.md) — Private user notes for moderators
- [Modmail](requirements/moderation/MODMAIL.md) — Community moderator messaging
- [Ban Evasion](requirements/moderation/BAN-EVASION.md) — Detection signals, system reports, confirm/dismiss flow
- [Modlog](requirements/moderation/MODLOG.md) — Unified `moderator_actions` audit trail
- [Report Integrity](requirements/moderation/REPORT-INTEGRITY.md) — Mass-report detection and trust penalties
- [Report Judgements](requirements/moderation/REPORT-JUDGEMENTS.md) — AI report recommendations and human review
- [Penalties](requirements/trust-safety/PENALTIES.md) — Vote-weight and report-abuse penalty semantics
- [Moderation System Users](requirements/moderation/MODERATION-SYSTEM-USERS.md) — `automod`, `ban-evasion`, and automated attribution
- [User Flow Test Matrix](requirements/user-flows/README.md) — key user flows (sources, posts, topics) × persona × Playwright coverage matrix
- [UI Components](requirements/navigation/COMPONENTS.md) — shadcn/ui component patterns and design guidelines
- [Bookmarks Catalog](requirements/content/BOOKMARKS-CATALOG.md) — `/my/<entity>/<listType>` self-routes per intent
- [Account Deletion & Data Request](requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md) — GDPR and data management
- [SEO](requirements/seo/SEO.md) — Search engine optimization
- [SEO Resources](requirements/seo/SEO-RESOURCES.md) — Curated external references for SEO and AI-search strategy
- [Website Specifications](requirements/seo/WEBSITE-SPECIFICATIONS.md) — Public web, agent, privacy, resilience, performance, and i18n specification alignment
- [Security](requirements/security/SECURITY.md) — Security requirements and policies
- [CSRF Protection](requirements/security/CSRF.md) — Layered CSRF defenses; JSON-only content-type and origin-guard invariants
- [Next.js CVE Tracking](requirements/security/SECURITY-NEXTJS-CVES.md) — Patch floor, per-CVE status, and edge mitigation reference for Next.js advisories
- [Auth](requirements/security/AUTH.md) — Authentication UI requirements
- [Community Comments](requirements/community/COMMUNITY-COMMENTS.md) — Community comment requirements
- [Contribution Limits](requirements/trust-safety/CONTRIBUTION-LIMITS.md) — Trust-tier contribution limits for content creation, configurable via DynamicConfig
- [Hostname Blocking](requirements/content/HOSTNAME-BLOCKING.md) — Hostname blocking rules

### Focused requirements references

- [Customer Support reference](requirements/admin/reference-customer-support-data-model.md)
- [Customer Support reference](requirements/admin/reference-customer-support-email-flow.md)
- [Customer Support reference](requirements/admin/reference-customer-support-overview.md)
- [Customer Support reference](requirements/admin/reference-customer-support-related.md)
- [Customer Support reference](requirements/admin/reference-customer-support-web-routes.md)
- [Fediverse Instance Anatomy reference](requirements/anatomy/reference-fediverse-instance-actions.md)
- [Fediverse Instance Anatomy reference](requirements/anatomy/reference-fediverse-instance-data-model.md)
- [Fediverse Instance Anatomy reference](requirements/anatomy/reference-fediverse-instance-list-item-card-anatomy.md)
- [Fediverse Instance Anatomy reference](requirements/anatomy/reference-fediverse-instance-see-also.md)
- [Fediverse Instance Anatomy reference](requirements/anatomy/reference-fediverse-instance-states.md)
- [Fediverse Instance Anatomy reference](requirements/anatomy/reference-fediverse-instance-surfaces.md)
- [Community Lists reference](requirements/community/reference-community-lists-community-metrics.md)
- [Community Lists reference](requirements/community/reference-community-lists-list-type.md)
- [Community Lists reference](requirements/community/reference-community-lists-overview.md)
- [Community Lists reference](requirements/community/reference-community-lists-roles-permissions.md)
- [Lists reference](requirements/content/reference-lists-api-backend-api-v1-lists.md)
- [Lists reference](requirements/content/reference-lists-architecture-decision-one-generic-entity-filtered-views.md)
- [Lists reference](requirements/content/reference-lists-native-client-surfaces.md)
- [Lists reference](requirements/content/reference-lists-phased-roadmap.md)
- [Lists reference](requirements/content/reference-lists-service-services-lists.md)
- [Lists reference](requirements/content/reference-lists-service-services-read-states.md)
- [Lists reference](requirements/content/reference-lists-web-surfaces.md)
- [Podcasts reference](requirements/content/reference-podcasts-architecture-decision-facet-not-a-new-topic-type.md)
- [Podcasts reference](requirements/content/reference-podcasts-parsing.md)
- [Podcasts reference](requirements/content/reference-podcasts-player-architecture.md)
- [Podcasts reference](requirements/content/reference-podcasts-schema.md)
- [Podcasts reference](requirements/content/reference-podcasts-tests.md)
- [Stories reference](requirements/content/reference-stories-api-endpoints.md)
- [Stories reference](requirements/content/reference-stories-clustering-algorithm.md)
- [Stories reference](requirements/content/reference-stories-data-model.md)
- [Topics reference](requirements/content/reference-topics-creating-topics.md)
- [Topics reference](requirements/content/reference-topics-topic-aliases.md)
- [Topics reference](requirements/content/reference-topics-topic-types.md)
- [Built-In AI Agents](requirements/moderation/reference-built-in-ai-agents.md)
- [Community Moderation reference](requirements/moderation/reference-community-moderation-api-routes.md)
- [Community Moderation reference](requirements/moderation/reference-community-moderation-authorization.md)
- [Community Moderation reference](requirements/moderation/reference-community-moderation-moderation-queue.md)
- [Community Moderation reference](requirements/moderation/reference-community-moderation-overview.md)
- [Community Moderation reference](requirements/moderation/reference-community-moderation-slot-limits.md)
- [GET /api/v1/communities/:slug/agent-prompts](requirements/moderation/reference-get-api-v1-communities-slug-agent-prompts.md)
- [GET /api/v1/communities/:slug/posts/:postId/moderation-results](requirements/moderation/reference-get-api-v1-communities-slug-posts-postid-moderation-results.md)
- [Moderation Flows reference](requirements/moderation/reference-moderation-flows-2-spam-detection.md)
- [Moderation Flows reference](requirements/moderation/reference-moderation-flows-4-llm-agent-moderation.md)
- [Moderation Flows reference](requirements/moderation/reference-moderation-flows-5-community-moderation.md)
- [Moderation Flows reference](requirements/moderation/reference-moderation-flows-6-user-reports.md)
- [Moderation Flows reference](requirements/moderation/reference-moderation-flows-native-client-capability-boundary.md)
- [Moderation Flows reference](requirements/moderation/reference-moderation-flows-overview.md)
- [Moderation Flows reference](requirements/moderation/reference-moderation-flows-public-documentation.md)
- [Moderation Results](requirements/moderation/reference-moderation-results.md)
- [Moderation Flow × Persona × Test Matrix reference](requirements/moderation/reference-moderation-test-matrix-matrix.md)
- [Moderation Flow × Persona × Test Matrix reference](requirements/moderation/reference-moderation-test-matrix-personas-legend.md)
- [Moderation Flow × Persona × Test Matrix reference](requirements/moderation/reference-moderation-test-matrix-status-legend.md)
- [Moderation Flow × Persona × Test Matrix reference](requirements/moderation/reference-moderation-test-matrix-workstream-key.md)
- [POST /api/v1/communities/:slug/agent-prompts/:promptId/test](requirements/moderation/reference-post-api-v1-communities-slug-agent-prompts-promptid-test.md)
- [POST /api/v1/communities/:slug/agent-prompts](requirements/moderation/reference-post-api-v1-communities-slug-agent-prompts.md)
- [POST /api/v1/communities/:slug/automod/simulate](requirements/moderation/reference-post-api-v1-communities-slug-automod-simulate.md)
- [Post Moderation reference](requirements/moderation/reference-post-moderation-api-routes.md)
- [Post Moderation reference](requirements/moderation/reference-post-moderation-audit-trail.md)
- [Post Moderation reference](requirements/moderation/reference-post-moderation-authorization-matrix.md)
- [Post Moderation reference](requirements/moderation/reference-post-moderation-overview.md)
- [Post Moderation reference](requirements/moderation/reference-post-moderation-pages.md)
- [Prompt Management](requirements/moderation/reference-prompt-management.md)
- [Reporting & Content Moderation reference](requirements/moderation/reference-reporting-rate-limiting.md)
- [Reporting & Content Moderation reference](requirements/moderation/reference-reporting-report-reasons.md)
- [Reporting & Content Moderation reference](requirements/moderation/reference-reporting-reportable-entities.md)
- [Action Buttons reference](requirements/navigation/reference-actions-action-buttons-by-entity.md)
- [Action Buttons reference](requirements/navigation/reference-actions-backend-api.md)
- [Action Buttons reference](requirements/navigation/reference-actions-component-reference.md)
- [Action Buttons reference](requirements/navigation/reference-actions-principles.md)
- [Asides reference](requirements/navigation/reference-asides-architecture.md)
- [Asides reference](requirements/navigation/reference-asides-aside-inventory.md)
- [Asides reference](requirements/navigation/reference-asides-core-rules.md)
- [Asides reference](requirements/navigation/reference-asides-page-to-aside-mapping.md)
- [Asides reference](requirements/navigation/reference-asides-styling-guidelines.md)
- [UI Components reference](requirements/navigation/reference-components-bookmark-buttons.md)
- [UI Components reference](requirements/navigation/reference-components-canonical-entity-list-item-components.md)
- [UI Components reference](requirements/navigation/reference-components-context-aware-entity-labels.md)
- [UI Components reference](requirements/navigation/reference-components-design-principles.md)
- [UI Components reference](requirements/navigation/reference-components-entity-reference-inputs.md)
- [UI Components reference](requirements/navigation/reference-components-installed-components.md)
- [UI Components reference](requirements/navigation/reference-components-page-layout-primitives.md)
- [UI Components reference](requirements/navigation/reference-components-patterns.md)
- [UI Components reference](requirements/navigation/reference-components-rsc-boundary-view-models.md)
- [Navigation reference](requirements/navigation/reference-navigation-gap-list-follow-up-issues.md)
- [Navigation reference](requirements/navigation/reference-navigation-intent-taxonomy.md)
- [Navigation reference](requirements/navigation/reference-navigation-route-intent-resolution.md)
- [Navigation reference](requirements/navigation/reference-navigation-rss-media-intent-bookmark-groups.md)
- [Navigation reference](requirements/navigation/reference-navigation-special-cases.md)
- [Navigation reference](requirements/navigation/reference-navigation-vocabulary.md)
- [Sidebar reference](requirements/navigation/reference-sidebar-bookmarks-groups.md)
- [Sidebar reference](requirements/navigation/reference-sidebar-buttons.md)
- [Sidebar reference](requirements/navigation/reference-sidebar-section-ordering.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-ai-tool-fields.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-bank-account-fields.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-credit-card-fields.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-data-quality-rules.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-hardware-fields.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-multi-topic-review-enhancements-planned.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-overview.md)
- [Data Points Specification reference](requirements/platform/reference-data-points-spec-review-structure-by-vertical.md)
- [Job Replayability & Idempotency reference](requirements/platform/reference-job-replayability-backfill-implementation-pattern.md)
- [Job Replayability & Idempotency reference](requirements/platform/reference-job-replayability-non-replayable-queues-by-design.md)
- [Job Replayability & Idempotency reference](requirements/platform/reference-job-replayability-overview.md)
- [Job Replayability & Idempotency reference](requirements/platform/reference-job-replayability-queue-replayability-matrix.md)
- [Job Replayability & Idempotency reference](requirements/platform/reference-job-replayability-rules-for-new-jobs.md)
- [Admin Navigation Matrix reference](requirements/reference-admin-navigation-matrix-known-gaps.md)
- [Admin Navigation Matrix `post` actions](requirements/reference-admin-navigation-matrix-post.md)
- [Admin Navigation Matrix reference](requirements/reference-admin-navigation-matrix-table-a-entity-surface-actions-navigation.md)
- [Admin Navigation Matrix reference](requirements/reference-admin-navigation-matrix-table-b-entity-action-description.md)
- [Admin Navigation Matrix `topic` actions](requirements/reference-admin-navigation-matrix-topic.md)
- [Agent reference](requirements/reference-agent.md)
- [Client Parity Matrix reference](requirements/reference-client-parity-matrix-legend.md)
- [Client Parity Matrix reference](requirements/reference-client-parity-matrix-table-a-cross-cutting-capabilities.md)
- [Client Parity Matrix reference](requirements/reference-client-parity-matrix-table-b-domain-surfaces.md)
- [Client Parity Matrix reference](requirements/reference-client-parity-matrix-table-c-active-gaps.md)
- [Comment reference](requirements/reference-comment.md)
- [Comments](requirements/reference-comments.md)
- [Communities](requirements/reference-communities.md)
- [Community Lists](requirements/reference-community-lists.md)
- [Community reference](requirements/reference-community.md)
- [Community list reference](requirements/reference-communitylist.md)
- [Crawler reference](requirements/reference-crawler.md)
- [CRM contact reference](requirements/reference-crmcontact.md)
- [Curated aside item reference](requirements/reference-curatedasideitem.md)
- [Domain reference (admin tab)](requirements/reference-domain-admin-tab.md)
- [Domain reference](requirements/reference-domain.md)
- [Domains / Hostnames](requirements/reference-domains-hostnames.md)
- [Dynamic config reference](requirements/reference-dynamicconfig.md)
- [URL-Routable Entity Catalog reference](requirements/reference-entities-covered-elsewhere-ban-new-inline-use.md)
- [URL-Routable Entity Catalog reference](requirements/reference-entities-with-helpers.md)
- [URL-Routable Entity Catalog reference](requirements/reference-entities-excluded-not-entity-urls.md)
- [URL-Routable Entity Catalog reference](requirements/reference-entities-how-to-use-this-catalog.md)
- [URL-Routable Entity Catalog reference](requirements/reference-entities-podcast-hub.md)
- [URL-Routable Entity Catalog reference](requirements/reference-entities-post-family.md)
- [Entity × Action Matrix reference](requirements/reference-entity-action-matrix-table-a-entity-surface-actions.md)
- [Entity × Action Matrix reference](requirements/reference-entity-action-matrix-table-b-entity-action-description.md)
- [Entity × Action Matrix reference](requirements/reference-entity-action-matrix-ui-exposure-gaps.md)
- [Entity × Lifecycle Flow Matrix reference](requirements/reference-entity-lifecycle-matrix-authorization-tiers.md)
- [Entity × Lifecycle Flow Matrix reference](requirements/reference-entity-lifecycle-matrix-known-gaps.md)
- [Entity × Lifecycle Flow Matrix reference](requirements/reference-entity-lifecycle-matrix-staff-ops-tool-flows.md)
- [Entity × Lifecycle Flow Matrix reference](requirements/reference-entity-lifecycle-matrix-table-a-entity-flow-authorization-page-component.md)
- [Fediverse Instances](requirements/reference-fediverse-instances.md)
- [Growth reference (analytics)](requirements/reference-growth-analytics.md)
- [List reference](requirements/reference-list.md)
- [Membership reference](requirements/reference-membership.md)
- [Podcast Episodes (rss_feed_item, feed_type='podcast')](requirements/reference-podcast-episodes-rssfeeditem-feedtype-podcast.md)
- [Post reference](requirements/reference-post.md)
- [PostgreSQL reference (ops)](requirements/reference-postgresql-ops.md)
- [Posts](requirements/reference-posts.md)
- [Recommendation reference](requirements/reference-recommendation.md)
- [Review Disputes](requirements/reference-review-disputes.md)
- [RSS Feed Items](requirements/reference-rss-feed-items.md)
- [RSS feed reference](requirements/reference-rssfeed.md)
- [RSS feed item reference (podcast episode)](requirements/reference-rssfeeditem-podcast-episode.md)
- [RSS feed item reference](requirements/reference-rssfeeditem.md)
- [RSS feed item category reference (admin-only)](requirements/reference-rssfeeditemcategory-admin-only.md)
- [RSS feed item category reference](requirements/reference-rssfeeditemcategory.md)
- [Scheduled job reference](requirements/reference-scheduledjob.md)
- [Sources / RSS Feeds](requirements/reference-sources-rss-feeds.md)
- [Support](requirements/reference-support.md)
- [Support contact reference](requirements/reference-supportcontact.md)
- [Support thread reference](requirements/reference-supportthread.md)
- [Topic Claims](requirements/reference-topic-claims.md)
- [Topic reference](requirements/reference-topic.md)
- [Topic recommendation reference](requirements/reference-topicrecommendation.md)
- [Topics](requirements/reference-topics.md)
- [URL reference](requirements/reference-url.md)
- [User-Owned Content & Account Features](requirements/reference-user-owned-content-account-features.md)
- [User reference](requirements/reference-user.md)
- [Users](requirements/reference-users.md)
- [Valkey reference (ops)](requirements/reference-valkey-ops.md)
- [Vote integrity flag reference](requirements/reference-voteintegrityflag.md)
- [Backend (defence-in-depth)](requirements/security/reference-backend-defence-in-depth.md)
- [CF Worker (edge — all responses)](requirements/security/reference-cf-worker-edge-all-responses.md)
- [Content Security Policy (CF Worker)](requirements/security/reference-content-security-policy-cf-worker.md)
- [Security Architecture reference](requirements/security/reference-security-authentication-sessions.md)
- [Security Architecture reference](requirements/security/reference-security-honeypot-fields.md)
- [Next.js CVE Tracking reference](requirements/security/reference-security-nextjs-cves-edge-mitigation-reference.md)
- [Next.js CVE Tracking reference](requirements/security/reference-security-nextjs-cves-patch-floor.md)
- [Security Architecture reference](requirements/security/reference-security-response-headers.md)
- [Security Architecture reference](requirements/security/reference-security-ssrf-protection.md)
- [Trust System reference](requirements/trust-safety/reference-trust-system-bot-defense-through-trust.md)
- [Trust System reference](requirements/trust-safety/reference-trust-system-contribution-gating.md)
- [Trust System reference](requirements/trust-safety/reference-trust-system-official-accounts-and-material-connections.md)
- [Trust System reference](requirements/trust-safety/reference-trust-system-overview.md)
- [Trust System reference](requirements/trust-safety/reference-trust-system-phase-2-post-launch-vote-weight-calibration.md)
- [Trust System reference](requirements/trust-safety/reference-trust-system-phase-3-scale-ml-based-trust.md)
- [Trust System reference](requirements/trust-safety/reference-trust-system-vote-weight-system.md)
- [Memberships reference](requirements/users/reference-memberships-architecture.md)
- [Memberships reference](requirements/users/reference-memberships-contribution-gating-anti-bot.md)
- [Memberships reference](requirements/users/reference-memberships-feature-limits.md)
- [Memberships reference](requirements/users/reference-memberships-membership-statuses.md)
- [Memberships reference](requirements/users/reference-memberships-plans.md)
- [Memberships reference](requirements/users/reference-memberships-refunds.md)
- [Memberships reference](requirements/users/reference-memberships-stripe-integration.md)
- [Referral Links reference](requirements/users/reference-referral-links-admin-validation-management.md)
- [Referral Links reference](requirements/users/reference-referral-links-my-referrals-click-log.md)
- [Referral Links reference](requirements/users/reference-referral-links-suggesting-referral-programs.md)
- [Referral Links reference](requirements/users/reference-referral-links-url-validation.md)

## Strategy

- [Strategy Index](strategy/README.md)
- [Product Strategy](strategy/product-strategy.md) — Multi-vertical consumer intelligence platform positioning, differentiators, content policy, trust phases, branding, failure modes
- [Landing Pages Strategy](strategy/landing-pages-strategy.md) — User landing pages as acquisition flywheel, social sharing, analytics, onboarding integration
- [Feedback Loops](strategy/feedback-loops.md) — 24 feedback loops across growth, engagement, trust, monetization, and defense; gap analysis and growth roadmap
- [Messaging & Voice](strategy/MESSAGING.md) — Brand voice, tone principles, and copy conventions

### Focused strategy references

- [Defensive / Anti-Abuse (9 loops)](strategy/reference-defensive-anti-abuse-9-loops.md)
- [Engagement / Retention (14 loops)](strategy/reference-engagement-retention-14-loops.md)
- [Existing Loops](strategy/reference-feedback-loops-existing-loops.md)
- [Growth Strategy](strategy/reference-feedback-loops-growth-strategy.md)
- [Missing Loops (Roadmap)](strategy/reference-feedback-loops-missing-loops-roadmap.md)
- [The Gap](strategy/reference-feedback-loops-the-gap.md)
- [Growth / Acquisition (8 loops)](strategy/reference-growth-acquisition-8-loops.md)
- [Monetization (6 loops)](strategy/reference-monetization-6-loops.md)
- [Trust / Data Quality (7 loops)](strategy/reference-trust-data-quality-7-loops.md)

## Operations

Manual operational runbooks — step-by-step procedures for enabling, rotating, and
disabling features that require secrets or Cloudflare configuration not managed by CI.

- [Operations Index](operations/README.md) — Runbook index and sync rule
- [Operations Runbook Template](operations/TEMPLATE.md) — Required sections for source-of-truth
  files, lifecycle symmetry, verification, and stale-doc sync notes
- [Review Succession History Audit](operations/review-succession-history-audit.md) — Run and interpret the frozen-cutoff, read-only archive-history audit
- [Staging Basic Auth](operations/cloudflare-worker-staging-auth.md) — Enable, rotate, and
  disable the HTTP basic-auth gate on `staging.voucha.ai`
- [Staging Turnstile Always-Approve](operations/staging-turnstile-always-approve.md) — Toggle
  staging Turnstile verification for MCP QA without changing stored credentials
- [Private Internal Reference Sites](operations/private-docs-site.md) — Provision, authenticate,
  rotate, and verify the OpenAPI, PostgreSQL, and Storybook references
- [Fediverse Staging Interoperability](operations/fediverse-staging-interop.md) — Validate public
  discovery, inbound follows, Accept delivery, and documented unsupported remote workflows
  back Apple, GitHub, X, or Bluesky worker proxying one provider at a time
- [OAuth Authorization Broker Rollout](operations/oauth-authorization-broker-rollout.md) — Roll
  out the durable Facebook, X, and GitHub broker by provider and client mode
- [Valkey Memory Pressure — Diagnosis & Recovery](operations/valkey-memory-recovery.md) — Diagnose
  ElastiCache memory pressure and use admin or audited ECS break-glass scoped recovery
- [Bedrock Batch DLQ — Purge](operations/bedrock-batch-dlq-purge.md) — Diagnose and purge the
  `bedrock-batch-dlq` SQS dead-letter queue
- [Deployed Error Investigation](operations/deployed-error-investigation.md) — CloudWatch alarms,
  Logs Insights, SQS DLQs, and Sentry for staging and production

### Focused operations references

- [Fediverse Staging Interop — Compatibility Matrix](operations/reference-fediverse-staging-interop-compatibility-matrix.md)
- [Fediverse Staging Interop — Configurable Inputs](operations/reference-fediverse-staging-interop-configurable-inputs.md)
- [Fediverse Staging Interop — Prerequisites](operations/reference-fediverse-staging-interop-prerequisites.md)
- [Fediverse Staging Interop — Procedure](operations/reference-fediverse-staging-interop-procedure.md)
- [Fediverse Staging Interop — Scope](operations/reference-fediverse-staging-interop-scope.md)
- [Fediverse Staging Interop — See Also](operations/reference-fediverse-staging-interop-see-also.md)
- [Fediverse Staging Interop — Source Of Truth](operations/reference-fediverse-staging-interop-source-of-truth.md)
- [Fediverse Staging Interop — Stale-Doc Sync Notes](operations/reference-fediverse-staging-interop-stale-doc-sync-notes.md)
- [Fediverse Staging Interop — Verify](operations/reference-fediverse-staging-interop-verify.md)
- [Private Docs Site — Disable](operations/reference-private-docs-site-disable.md)
- [Private Docs Site — Enable](operations/reference-private-docs-site-enable.md)
- [Private Docs Site — Required GitHub Configuration](operations/reference-private-docs-site-required-github-configuration.md)
- [Private Docs Site — Rotation and Recovery](operations/reference-private-docs-site-rotation-and-recovery.md)
- [Private Docs Site — Security Boundaries](operations/reference-private-docs-site-security-boundaries.md)
- [Private Docs Site — See Also](operations/reference-private-docs-site-see-also.md)
- [Private Docs Site — Source Of Truth](operations/reference-private-docs-site-source-of-truth.md)
- [Private Docs Site — Verify](operations/reference-private-docs-site-verify.md)

## Admin Operations

- [Operational Runbooks](runbooks/README.md) — CSAM/child-safety escalation and product-safety/recall
  procedures (staff-only; legal reporting obligations and cross-functional contacts)
- [Queue Monitoring API](../backend/api/v1/mq/README.md) — Real-time queue stats, SSE streaming, pause/resume, GlideMQ dashboard
  - [Queue monitoring service](../backend/services/queue-monitoring/README.md) — Service layer for queue stats
- [PostgreSQL Admin API](../backend/api/v1/psql/README.md) — Migration status, partition management, async DB jobs
- [Valkey Admin API](../backend/api/v1/valkey/README.md) — Bloom filter config/rebuild, entity cache clearing

## External Articles

- [Articles Index](../articles/README.md) — Collection of reference articles
- [Voucha Bot](../articles/voucha-bot.md) — Bot detection and handling
- [News Source Eligibility](../articles/news-source-eligibility.md) — News source criteria
