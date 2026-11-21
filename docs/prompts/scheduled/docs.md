Find at most one concrete, bounded documentation improvement that is safe to ship in one PR. Start from a domain index, broken-link report, or known behavior change; if no candidate qualifies, make no repository changes and report why.

Unit: one domain folder under `docs/`.

Load `documentation` and follow [instruction placement](../../AGENTS.md). Focus: `docs/**` content, links, diagrams, and code cross-references. Agent-instruction contradictions (`AGENTS.md`, skills) belong to [agent-skill-docs.md](agent-skill-docs.md).

- One owner per fact and leaf inventory; link new pages from their domain README, and do not duplicate inventories in [docs/README.md](../../README.md) and [docs/catalog/README.md](../../catalog/README.md).
- Verify commands and Mermaid nodes, edges, and directions against source; run `pnpm run lint:links` (link existence does not prove bidirectional coverage).
- In [client parity](../../requirements/CLIENT-PARITY-MATRIX.md), closed issue citations describe completed work; rows with remaining Swift/.NET/web gaps must still name them.
