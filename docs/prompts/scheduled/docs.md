Use [the documentation index](../../README.md) and current source to find at most one concrete, bounded documentation improvement that is safe to ship in one PR. Start from a domain index, broken-link report, or known behavior change; do not read the whole tree. If no candidate qualifies, make no repository changes and report why.

- Load `documentation` and follow [instruction placement](../../AGENTS.md). Contradictions between agent instructions or skill triggers belong to [agent-skill-docs](agent-skill-docs.md).
- Give each fact and leaf inventory one owner; link a new page from its domain README and touch the top-level index only for a new domain. Do not duplicate inventories in [docs/README.md](../../README.md) and [docs/catalog/README.md](../../catalog/README.md).
- Link docs to real code entrypoints and code navigation back to the owning guide.
- Verify commands and Mermaid nodes, edges, and directions against source. Run `pnpm run lint:links`; link existence does not prove bidirectional coverage.
- In [client parity](../../requirements/CLIENT-PARITY-MATRIX.md), closed issue citations describe completed work; rows with remaining Swift/.NET/web gaps must still name them.
