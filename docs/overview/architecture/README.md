# Architecture

System design, pipelines, and application-layer patterns for Voucha.

## Documents

| File                                                                                    | Description                                                                                                  |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [Auth Overview](./auth-overview.md)                                                     | Authentication architecture and session flows                                                                |
| [Error Handling](./error-handling.md)                                                   | Error response contract, code registry, propagation chain, security policy                                   |
| [Caching Strategy](./caching-strategy.md)                                               | 3-tier caching architecture (CloudFront, CF Worker, Valkey)                                                  |
| [Rate Limiting](./rate-limiting.md)                                                     | 3-layer rate limiting: edge IP, per-endpoint, and user-aware trust tier                                      |
| [CAPTCHA & Bot Protection](./captcha.md)                                                | Turnstile (hard gate) + reCAPTCHA Enterprise (invisible score) matrix                                        |
| [Analytics Pipeline](./analytics-pipeline.md)                                           | Local JSONL + DuckDB analytics, table registry, env vars, Phase 3 Firehose plan                              |
| [Content Rendering](./content-rendering.md)                                             | Post rendering rules, image proxying, mention parsing                                                        |
| [HTML & Markdown Rendering Passes](./html-markdown-rendering-passes.md)                 | Multi-pass rendering pipeline for safe HTML and Markdown output                                              |
| [AI Platform](./ai-platform.md)                                                         | Shared classifier identity, execution, failure rules, provider boundaries and measurement                    |
| [AI Agents](./ai-agents.md)                                                             | Content moderation, semantic embeddings and focused agent pipeline references                                |
| [Bedrock Embeddings](./bedrock-embeddings.md)                                           | Dual-pipeline embeddings architecture: real-time single queue and Bedrock batch API                          |
| [Event Ingress Routing](./event-ingress.md)                                             | Canonical routing rule for inbound AWS events and webhooks: in-VPC Lambda vs. public endpoint                |
| [Crawling](./crawling.md)                                                               | HTML/RSS crawl pipeline, rate limiting, scheduling, blacklist, robots.txt                                    |
| [Search](./search.md)                                                                   | Hybrid full-text + vector search, filters, sort modes, pagination                                            |
| [Cursor Pagination](./pagination.md)                                                    | Cross-surface contract for database-backed list queries, APIs, and clients                                   |
| [Notifications](./notifications.md)                                                     | Subscription rules, manual sends, browser push delivery                                                      |
| [Sitemaps](./sitemaps.md)                                                               | XML sitemap generation, S3 upload, eligibility rules                                                         |
| [Feeds](./feeds.md)                                                                     | Personalized post and RSS item feed queries                                                                  |
| [Dynamic Config](./dynamic-config.md)                                                   | Admin-managed Valkey DynamicConfig namespaces, authorization hooks, and audit history                        |
| [API Egress Proxy](./api-egress-proxy.md)                                               | Explicit provider-scoped HTTP CONNECT routing for IPv4-only APIs                                             |
| [Feature Flags](./feature-flags.md)                                                     | Runtime feature toggles via Valkey DynamicConfig                                                             |
| [Conversations](./conversations.md)                                                     | Native transcript storage and synchronization                                                                |
| [Entity Relations](./entity-relations.md)                                               | Follow, mute, block, and subscription relationships                                                          |
| [Bookmarks](./bookmarks.md)                                                             | User bookmark system with bloom filter optimization                                                          |
| [Post Lifecycle](./post-lifecycle.md)                                                   | Post creation, async fan-out, moderation, and sitemap updates                                                |
| [TypeScript Standards](./typescript-standards.md)                                       | Type-level and code-style conventions                                                                        |
| [Explicit Resource Management](./reference-typescript-standards-resource-management.md) | Lexical ownership criteria and async-disposal exclusions                                                     |
| [Google Tag Manager](./gtm.md)                                                          | Server-side GTM proxy architecture, setup, and custom events                                                 |
| [Graceful Shutdown](./graceful-shutdown.md)                                             | Backend process shutdown sequence, signal handling, and drain order                                          |
| [Partitioning Strategy](./partitioning-strategy.md)                                     | When and how to partition PostgreSQL tables                                                                  |
| [Partition Pruning Hints](./partition-pruning-hints.md)                                 | UUIDv7 temporal ordering constraints for PostgreSQL RANGE partitions                                         |
| [.NET Deep Linking][client-dotnet-deep-linking]                                         | MAUI protocol activation, shell routing, and native login-link handling                                      |
| [Agent Tools](./agent-tools/README.md)                                                  | LLM tool registry: surfaces (internal, MCP, iOS client), type definitions, and tool implementation reference |
| [Native Clients](./native-clients.md)                                                   | Platform ownership table and framework rationale (Swift: macOS/iOS/Android; MAUI: Windows)                   |

[client-dotnet-deep-linking]: https://github.com/vouchington/vouchington-clients/blob/main/docs/architecture/dotnet-deep-linking.md

## Sync Rule

When architecture decisions change, update the relevant doc here and cross-link from
`docs/requirements/`, `backend/services/`, or the relevant workspace `AGENTS.md`.

## Subsystem indexes

- [Backend package catalogs](backend/catalogs/README.md) — agents, data stores, modules, queues, services, and workers
- [AI agent architecture](ai-agents/README.md) · [Services](services/README.md) · [Queues](queues/README.md)
- [Backend](backend/README.md) · [Web](web/README.md) · [Shared TypeScript](typescript-shared/README.md)

## Reference index

- [App Attest](app-attestation.md)
- [AI Agents reference](reference-ai-agents-content-moderation-pipeline.md)
- [Native Conversation Sync](reference-ai-agents-native-conversations.md)
- [AI Agents reference](reference-ai-agents-semantic-search-embeddings.md)
- [AI Agents reference](reference-ai-agents-systems-overview.md)
- [Analytics Pipeline reference](reference-analytics-pipeline-code-entry-points.md)
- [Analytics Pipeline reference](reference-analytics-pipeline-environment-variables.md)
- [Analytics Pipeline reference](reference-analytics-pipeline-retention.md)
- [Analytics Pipeline reference](reference-analytics-pipeline-table-registry.md)
- [App Attest reference](reference-app-attestation-configuration.md)
- [App Attest reference](reference-app-attestation-session-duration-the-dc-claim.md)
- [App Attest reference](reference-app-attestation-supported-devices.md)
- [App Attest reference](reference-app-attestation-two-ceremonies.md)
- [Authentication Overview reference](reference-auth-overview-login-flows.md)
- [Authentication Overview reference](reference-auth-overview-multi-factor-authentication.md)
- [Authentication Overview reference](reference-auth-overview-security-recommendations.md)
- [Authentication Overview reference](reference-auth-overview-server-side-auth.md)
- [Authentication Overview reference](reference-auth-overview-stateless-session-architecture.md)
- [Authentication Overview reference](reference-auth-overview-valkey-state.md)
- [Authentication Overview reference](reference-auth-overview-web-client-auth-boundary.md)
- [Bot Tiers](reference-bot-tiers.md)
- [Caching Strategy reference](reference-caching-strategy-architecture-overview.md)
- [Caching Strategy reference](reference-caching-strategy-cache-tiers.md)
- [Caching Strategy reference](reference-caching-strategy-client-side-personalization.md)
- [Crawling Architecture reference](reference-crawling-components.md)
- [Crawling Architecture reference](reference-crawling-error-handling.md)
- [Crawling Architecture reference](reference-crawling-referral-link-crawling.md)
- [Error Handling reference](reference-error-handling-client-side-onerror-web-lib-on-error.md)
- [Error Handling reference](reference-error-handling-crawler-error-auto-disable.md)
- [Error Handling reference](reference-error-handling-error-response-contract.md)
- [Error Handling reference](reference-error-handling-precondition-errors-and-action-oriented-modals.md)
- [Error Handling reference](reference-error-handling-server-side-error-boundaries.md)
- [Fediverse Federation reference](reference-fediverse-federation-constraints-that-bind-every-phase.md)
- [Fediverse Federation reference](reference-fediverse-federation-phase-c-outbound-activitypub-resurrect-the-removed-federation-server-shipped.md)
- [Fediverse Federation reference](reference-fediverse-federation-phase-d-bluesky-account-linking-and-follow-propagation-shipped.md)
- [Fediverse Federation reference](reference-fediverse-federation-protocol-reality.md)
- [Native Client Strategy reference](reference-native-clients-spending-category-management.md)
- [Navigation Performance](reference-navigation-performance.md)
- [Origin and Browser `Vary` Boundaries](reference-origin-and-browser-vary-boundaries.md)
- [Post / Comment Creation Pipeline reference](reference-post-lifecycle-comment-specific-behavior.md)
- [Post / Comment Creation Pipeline reference](reference-post-lifecycle-community-moderation-pipeline.md)
- [Post / Comment Creation Pipeline reference](reference-post-lifecycle-key-files.md)
- [Post / Comment Creation Pipeline reference](reference-post-lifecycle-post-creation-pipeline.md)
- [Post / Comment Creation Pipeline reference](reference-post-lifecycle-story-post-behavior.md)
- [Post / Comment Creation Pipeline reference](reference-post-lifecycle-table-of-contents.md)
- [Rate Limiting reference](reference-rate-limiting-creation-gates.md)
- [Rate Limiting reference](reference-rate-limiting-layer-1-cloudflare-worker-edge.md)
- [Rate Limiting reference](reference-rate-limiting-layer-3-user-aware-trust-tier-backend.md)
- [Rate Limiting reference](reference-rate-limiting-layer-4-per-route-rate-limiting-backend.md)
- [Rate Limiting reference](reference-rate-limiting-rest-usage-quota.md)
- [Tier 1: CF Worker Edge Cache (Workers Cache)](reference-tier-1-cf-worker-edge-cache-workers-cache.md)
- [Tier 2: Backend HTTP Cache-Control](reference-tier-2-backend-http-cache-control.md)
- [Tier 3: Backend Valkey Cache](reference-tier-3-backend-valkey-cache.md)
- [TypeScript Standards reference](reference-typescript-standards-encoding-invariants-structurally.md)
- [TypeScript Standards reference](reference-typescript-standards-function-naming-prefixes.md)
- [TypeScript Standards reference](reference-typescript-standards-third-party-type-declarations.md)
- [TypeScript Standards reference](reference-typescript-standards-type-ownership-model.md)
