Use [the documentation index](../../README.md) and current source to find at most one concrete,
bounded documentation improvement that is safe to ship in one PR. Start with a domain index,
broken-link report, or a known behavior change; do not read the whole documentation tree. If no
candidate qualifies, make no repository changes and report why.

- Follow [instruction placement](../../AGENTS.md): scoped invariants in the nearest `AGENTS.md`,
  task-triggered procedures in skills, and explanatory guides in `docs/**`. Source README files
  provide short navigation to their owner docs. Use [agent-skill-docs](agent-skill-docs.md) for
  contradictions between agent instructions or skill triggers.
- Give each fact and complete leaf inventory one owner. Link the new page from its domain README;
  update the top-level index only when adding a domain. Do not duplicate inventories in
  [docs/README.md](../../README.md) and [docs/catalog/README.md](../../catalog/README.md).
- Link docs to real code entrypoints and relevant code navigation back to the owning guide.
  Backend business logic explanations belong in `docs/**`; API contracts belong in the API docs.
- Keep `AGENTS.md` concise and within the configured `agents-md-max-size` budget. Move explanations,
  examples, historical incidents, and changing inventories to their owner docs; do not add nested
  instruction files merely to satisfy reachability checks.
- Verify commands and Mermaid nodes, edges, directions, and state changes against their source.
  A rendered diagram or syntactically plausible command is not sufficient evidence.
- Preserve useful fragments and update links, generators, and code consumers when moving a page.
  Use Markdown links for file navigation. Run `pnpm run lint:links`; link existence does not prove
  bidirectional coverage. Change lychee or link-check configuration only when the selected fix needs it.
- Follow the public/private documentation boundary and version-pinning policy in the owning docs.
- In [client parity](../../requirements/CLIENT-PARITY-MATRIX.md), closed issue citations describe
  completed work; rows with remaining Swift/.NET/web gaps must still name those gaps.
- Keep lifecycle/edit checklists under `docs/checklists/**` and cross-link their owning skills.
