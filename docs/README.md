# Documentation

`docs/**` is the durable codebase map. Start with the index owned by the domain, then follow its
links to the relevant leaf page. Keep each complete leaf list in one owner index; do not copy it
into this page and `docs/catalog/README.md`.

## Domain indexes

- [Development](development/README.md) — local setup, testing, CI, databases, dependencies, and tooling.
- [Architecture and infrastructure](overview/README.md) — system architecture, services, queues, and deployed infrastructure.
- [Product and API requirements](requirements/README.md) — user flows, API contracts, product policy, and client parity.
- [Operations](operations/README.md) — production and staging operations, investigations, and recovery.
- [Runbooks](runbooks/README.md) — operational procedures.
- [Checklists](checklists/README.md) — commit, package, CI, infrastructure, and backend queue checklists.
- [Agent and automation prompts](prompts/README.md) — automation templates and scheduled prompts; the complete scheduled list is [SCHEDULED.md](prompts/SCHEDULED.md).
- [Strategy](strategy/README.md) — product and engineering strategy.
- [Focused agent-facing references](catalog/README.md) — cross-cutting pages directly routed from workspace instructions.

## Documentation rules

- Cross-link related docs and code owners. Update links, fragments, code consumers, and generators
  when moving a page. Follow the [placement rubric](AGENTS.md) for `AGENTS.md`, skills, and `docs/**`.
- Keep public documentation free of real operational thresholds, infrastructure identities, spend,
  unit costs, and business projections. Those belong in private `vouchington/vouchington-docs`;
  consult the [private-doc registry](development/docs-moved-to-vouchington-docs.md) before moving
  private material or replacing an apparently missing page.
- Link canonical decisions and values instead of duplicating them. Add a compact Mermaid diagram to
  docs explaining a system with multiple components, asynchronous handoffs, or state transitions.
- Follow the [docs pinning policy](development/dependency-updates.md#docs-pinning-policy) and avoid
  restating changing versions or configuration values in prose.
- Keep navigation within the configured three-link reachability budget. Configured indexes (`README.md`
  and `SCHEDULED.md`) are the supported intermediate pages; do not add instruction files solely to make a page reachable.

For implementation workflow and validation, use the [agent-workflow skill](../.agents/skills/agent-workflow/implementation.md).

## Reference index

- [Contributor Covenant Code of Conduct](../CODE_OF_CONDUCT.md)
- [Contributing](../CONTRIBUTING.md)
- [Voucha](../README.md)
- [Security Policy](../SECURITY.md)
