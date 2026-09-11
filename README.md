# Voucha

Voucha is a multi-vertical consumer intelligence platform built on human trust signals. Structured crowd-sourced data (reviews, data points, votes) creates layered trust across product domains. The social graph determines whose opinion matters to you.

## Launch Verticals

| Vertical              | What Users Get                                       | Example Data Point                                     |
| --------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| **Credit Cards**      | Approval odds, spending optimization, referral links | "Approved for CSR, 740 score, 2 inquiries"             |
| **Computer Hardware** | Real-world benchmarks, failure rates, compatibility  | "RTX 5090 failed after 8 months, RMA approved"         |
| **AI Tools**          | Usage patterns, switch data, honest comparisons      | "Switched from ChatGPT to Claude for coding, 6 months" |

## Key Features

- **Structured data points** — Queryable approval/failure/ownership data
- **Multi-topic reviews** — Forced-different ratings in head-to-head comparisons
- **Trust-scored RSS &amp; domain authority** — Community votes on news sources
- **Social graph prioritization** — Your friend's referral link > stranger's
- **Landing pages** — Every user gets @username as a shareable referral hub
- **Trust-filtered AI chat** — AI answers from YOUR trusted sources
- **Multi-vertical** — Same trust infrastructure across all product domains

Voucha is a monorepo containing multiple projects that work together to provide a comprehensive platform.

The public product includes social topic pages, a feed-first `/sources` directory for RSS discovery, and `/domains` authority pages that expose domain trust signals, top URLs, and linked feeds.
Across the web app, cursor-paginated lists are expected to append with infinite scrolling rather than route-level next-page navigation.

## Projects

- **backend/** — Backend server and worker processes (TypeScript, Node.js, PostgreSQL, Valkey)
- **ts-shared/** — Shared TypeScript packages consumed across all workspaces (backend, cloudflare-worker, lambdas)
- **web/** — Next.js app-router frontend
- **cloudflare-worker/** — Cloudflare Worker edge router and caching layer
- **lambdas/** — Serverless functions (image resize, SES inbound)
- **playwright/** — End-to-end browser tests
- **integration-tests/** — Fetch-based full-stack integration tests
- **dev/** — Worktree and local development tooling
- **ci/** — CI-local reproduction and workflow support tooling
- **static-code-analysis/** — Static-analysis tools and invariant tests

## Documentation

- [All docs](docs/README.md) — Full documentation index
- [System Dependencies](docs/development/system-dependencies.md) — Voucha's host capability contract and canonical host-setup owner
- [Backend Setup](docs/development/BACKEND-SETUP.md) — Local development environment setup
- [Local Site Testing Skill](.agents/skills/local-site-testing/SKILL.md) — Agent guide for full-site startup and HTTPS browser validation
- [Agent Workflow & SDLC](.agents/skills/agent-workflow/SKILL.md) — Agent workflow, SDLC, and AI tool policy
- [Codex Configuration](.codex/README.md) — Codex plugin provisioning and repo-scoped configuration
- [Monorepo Guide](docs/development/MONOREPO.md) — Monorepo structure and conventions
