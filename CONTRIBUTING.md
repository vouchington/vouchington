# Contributing

Thanks for your interest in contributing to Voucha. This file is a thin
front door — the real rules live in the docs it links to; see those for
details rather than looking for them duplicated here.

## Setup

Start with the [README](README.md) for project layout and local setup, and
[docs/development/MONOREPO.md](docs/development/MONOREPO.md) for how the
workspaces fit together.

## Workflow

Agent and human contributors alike follow the
[agent workflow skill](.agents/skills/agent-workflow/SKILL.md), which is the
canonical source for how work here is planned, implemented, and shipped:

- [Start of Work](.agents/skills/agent-workflow/start-of-work.md)
- [Implementation](.agents/skills/agent-workflow/implementation.md)
- [Git and PRs](.agents/skills/agent-workflow/git-and-prs.md)

Root project principles and directory-scoped rules are in
[CLAUDE.md](CLAUDE.md).

## Pull requests

New PRs are opened as **drafts** and only marked ready for review once the
change is genuinely shippable — see
[Git and PRs](.agents/skills/agent-workflow/git-and-prs.md) for the exact
flow.

## Before your commit lands

Commits and PRs must pass the lint and test gates described in:

- [docs/development/tests.md](docs/development/tests.md)
- [docs/development/ci.md](docs/development/ci.md)
- [docs/checklists/commit.md](docs/checklists/commit.md)
- [docs/checklists/package-json.md](docs/checklists/package-json.md) (if
  you're touching dependencies)

## Reporting security issues

Please don't file a public issue for a suspected vulnerability — see
[SECURITY.md](SECURITY.md) instead.

## Code of Conduct

This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).
