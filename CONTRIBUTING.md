# Contributing

Thanks for your interest in Voucha. This file is a thin front door — the real
rules live in the docs it links to; see those for details rather than looking
for them duplicated here.

**This project does not accept outside pull requests.** The source is published
to be read, run, and learned from, not to be developed collectively. Pull
requests from people outside the project are closed unreviewed. Everything
below describes how work is done _inside_ the project; it is kept public
because the source is public, not as an invitation.

Bug reports and questions are welcome as issues.

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

Within the project, new PRs are opened as **drafts** and only marked ready for
review once the change is genuinely shippable — see
[Git and PRs](.agents/skills/agent-workflow/git-and-prs.md) for the exact
flow.

## Licensing of contributions

The repository is licensed under [FSL-1.1-MIT](LICENSE), which converts to the
MIT license two years after each version is published.

GitHub's default rule is inbound=outbound: absent any other agreement, anything
you add to a repository is licensed under that repository's own terms. Under
FSL that would leave the project unable to relicense the contribution —
including at the two-year MIT conversion the license promises everyone.

So, as an exception to that default: if you do submit a contribution despite
the policy above, you grant Jonathan Ong a perpetual, worldwide, irrevocable,
royalty-free, non-exclusive license to use, reproduce, modify, distribute, and
relicense that contribution under any terms, including terms different from
FSL-1.1-MIT. You also confirm that the contribution is yours to license. This
grant runs only to the project; everyone else receives the contribution under
FSL-1.1-MIT like the rest of the source.

### Why workspace `package.json` files say `"license": "UNLICENSED"`

Every workspace manifest in this monorepo is `private: true` and is never
published to a registry. npm's own docs recommend the `UNLICENSED` `license`
value for exactly that case. That field is npm-registry metadata about
publishability, not a statement of your rights to the source — the actual
license grant for this repository is [LICENSE](LICENSE), described above.
`docs/checklists/package-json.md` covers the field-level rule that enforces
this convention.

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
