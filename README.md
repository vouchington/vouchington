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

Voucha is a monorepo of several workspaces.

## Documentation

- [All docs](docs/README.md) — Full documentation index
- [System Dependencies](docs/development/system-dependencies.md) — Voucha's host capability contract and canonical host-setup owner
- [Getting Started](docs/development/README.md) — Local development environment setup
- [Local Site Testing Skill](.agents/skills/local-site-testing/SKILL.md) — Agent guide for full-site startup and HTTPS browser validation
- [Agent Workflow & SDLC](.agents/skills/agent-workflow/SKILL.md) — Agent workflow, SDLC, and AI tool policy
- [Codex Configuration](.codex/README.md) — Codex plugin provisioning and repo-scoped configuration
- [Monorepo Guide](docs/development/MONOREPO.md) — Monorepo structure and conventions

## Contributing

- [Contributing Guide](CONTRIBUTING.md) — How to propose a change and what CI expects before review
- [Code of Conduct](CODE_OF_CONDUCT.md) — Contributor Covenant 2.1, and how to report a violation
- [Security Policy](SECURITY.md) — How to report a vulnerability privately

## License

Voucha is source-available under the
[Functional Source License, Version 1.1, MIT Future License](LICENSE)
(`FSL-1.1-MIT`). You may read, run, modify, and redistribute the source for any
purpose other than a Competing Use — broadly, offering it to others as a
commercial product or service that substitutes for Voucha. Internal use,
non-commercial education, and non-commercial research are explicitly permitted.

Each version additionally becomes available under the MIT license two years
after it is published. See [LICENSE](LICENSE) for the controlling terms.

Workspace `package.json` files carry `"license": "UNLICENSED"` because they
are private and never published to a registry — that's npm-registry metadata,
not a separate rights statement. See
[CONTRIBUTING.md](CONTRIBUTING.md#why-workspace-packagejson-files-say-license-unlicensed).
