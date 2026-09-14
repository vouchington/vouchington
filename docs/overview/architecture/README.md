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
| [AI Agents](./ai-agents.md)                                                             | LLM moderation pipeline, semantic embeddings, agent conversations                                            |
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
| [Conversations](./conversations.md)                                                     | LLM agentic chat sessions and message storage                                                                |
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
`docs/requirements/`, `backend/services/`, or the relevant workspace `CLAUDE.md`.
