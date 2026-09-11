---
title: 'Voucha for Developers: Open Standards, API Access, Structured Data'
slug: for-developers
post_type: article
topics:
  - voucha
---

# Voucha for Developers: Open Standards, API Access, Structured Data

If you're a developer who cares about hardware or AI tools — the kind of person who actually reads the benchmarks and follows the reliability threads — Voucha is something you'll find useful as a consumer first. But there's also a technical layer worth knowing about.

Here's what's under the hood and what's available to build on.

## The Tech Stack

Voucha runs a hybrid Node.js + Rust backend, PostgreSQL with pgvector for embeddings, Valkey for caching, and Cloudflare Workers for edge routing. The web frontend is Next.js.

### Rust + Node.js Hybrid

Performance-critical paths run in Rust via the `@jongleberry/vurst-*` N-API packages, giving Node.js workers native-speed processing without the complexity of a separate Rust service. This includes HTML-to-Markdown conversion, content parsing, text chunking, and URL canonicalization.

### PostgreSQL + pgvector

PostgreSQL handles the relational data model (users, posts, data points, trust scores) with RANGE partitioning on UUIDv7 keys for time-series query optimization. pgvector powers similarity search for the AI chat feature, embedding structured data points and reviews for retrieval-augmented generation.

Materialized views handle expensive aggregations (approval rates, failure rates, decay-ranked referral links) with scheduled refreshes rather than real-time computation. This keeps read-heavy pages fast without complex caching logic.

### Cloudflare Workers

Edge routing and caching run on Cloudflare Workers. The worker handles request routing, cache management, and edge-level optimizations before requests hit the origin — keeping time-to-first-byte low globally without a complex CDN configuration.

### No Banned Packages

The project avoids CPU-intensive JavaScript packages where Rust alternatives exist. Heavy lifting (HTML parsing, text processing, cryptographic operations) happens in Rust. The Node.js layer handles I/O, business logic, and API routing — the things Node.js is actually good at.

## Structured Data via API

Voucha exposes structured data through its API. Credit card approval rates, hardware failure rates, AI tool switch patterns — the aggregate data that powers the consumer-facing product is accessible programmatically.

What you can build with it:

- **Comparison widgets** for your own review site or blog
- **Automated alerts** for approval rate changes on cards you're tracking
- **Data visualizations** of reliability trends across product categories
- **Research tools** that combine Voucha data with other data sources
- **Recommendation engines** that factor in community trust signals

## RSS-First Architecture

Content distribution on Voucha is RSS-native. Topic feeds, user feeds, and news aggregation all support RSS:

- Subscribe to any topic or user in your preferred feed reader
- Build integrations that consume Voucha content through standard protocols
- No API key required for public RSS feeds
- Content is delivered in structured formats, not just titles and links

RSS-first is a deliberate architectural choice. It aligns with the open web ethos and ensures Voucha content is accessible through standard protocols, not locked behind proprietary APIs.

## Domain Trust Scoring

Voucha assigns trust scores to domains — news sites, blogs, review outlets — based on community voting. This creates a crowd-sourced domain reputation system that's useful beyond the platform itself.

The mechanism:

- Users upvote and downvote content from specific domains
- Domain trust accumulates as a weighted sum of community votes
- Higher-trust domains surface higher in news feeds and search results
- Trust decays over time, requiring ongoing community validation

For developers building news aggregation or content curation tools, domain trust scores provide a community-verified quality signal that pure engagement metrics don't offer.

## Trust-Filtered AI

Voucha's AI chat feature is grounded in community-verified data, not raw internet text. The RAG pipeline retrieves structured data points and trust-scored reviews, filtered by the trust system, to provide responses that reflect what trusted community members have actually experienced.

This is a different approach from general-purpose AI search:

- Responses cite specific data points with contributor trust levels
- Aggregate statistics come with confidence intervals
- The social graph influences which data the AI prioritizes in responses
- Low-trust content is deprioritized in retrieval

For developers interested in trust-filtered RAG architectures, this is an implementation of the principle that retrieval quality matters more than generation quality. The AI is only as good as the data it retrieves.

## Open Standards Mindset

Voucha is built on open standards where they exist:

- **RSS** for content distribution
- **OAuth** for authentication
- **JSON API** for data access
- **PostgreSQL** — no proprietary database dependencies
- **Cloudflare Workers** — standard Web Workers API, portable to other edge runtimes

If the standard exists and works, use it. Don't reinvent protocols. Don't build walled gardens.

## What Developers Do on Voucha

Beyond using the platform as consumers (hardware and AI tool decisions are the most common), developers engage with Voucha in specific ways:

- **Contribute to AI tool data** — Developer-specific tools (IDEs, hosting platforms, CI/CD, monitoring) benefit from structured data points and comparison reviews from actual practitioners
- **Build on the API** — Integrate structured consumer data into your own projects
- **Consume RSS feeds** — Follow topics and contributors through standard feed readers
- **Study the patterns** — The trust-weighted, structured-data approach to aggregating reviews is an interesting engineering problem with applications well beyond product reviews

If you're building anything involving user-generated content, trust systems, or structured data aggregation, the patterns Voucha implements — decay-ranked scoring, social graph prioritization, confidence-interval aggregation, contributor trust tiers — are worth a look.

The code reflects real engineering tradeoffs in a production system. The data is real, contributed by real users making real purchase decisions.
