Review [CLAUDE.md](../../../CLAUDE.md), [README.md](../../../README.md), [docs/\*\*](../../), and `**/*.md`. Pick exactly one concrete, bounded improvement that is safe to ship in one PR.

Rules:

- CLAUDE.md notes principles and requirements. All other docs are wikis. There should be very little overlap between them.
- Avoid duplication of content. Use linking instead.
- When changing code, update the nearest docs. Keep `backend/queues/` ↔ `backend/services/`, `backend/services/` ↔ `docs/**`, `web/` ↔ `docs/**`, and `cloudflare-worker/` ↔ `docs/**` cross-referenced.
- Backend business logic docs belong in `backend/services/` or `docs/**`, not in API routes or systems.
- Cross-links must be bidirectional: `docs/**` pages must link to relevant code entry points by file path. Index new pages in [`docs/README.md`](../../README.md) and [`docs/catalog/README.md`](../../catalog/README.md); `CLAUDE.md` points at the catalog, not each page. See [docs/CLAUDE.md](../../CLAUDE.md) for instruction placement.
- `pnpm run lint:links` validates that links resolve, but it does not enforce bidirectional coverage.
- Use markdown links to reference other files instead of using backticks.
- Is there any opportunity to make CLAUDE.md files smaller by moving CLAUDE.md content to deeper subdirectories, docs/\*\*, skills, or rules? We want to minimize loaded context. CLAUDE.md files must hold only durable principles and rules; tracked bug lists, state tables, SQL snippets, and long examples belong in `docs/**` or a co-located README — replace them with a one-line pointer and a cross-link.
- Do any folders need improved [README.md](../../../README.md) files? MermaidJS, tables, and bullet points are preferred.
- Verify Mermaid semantics against cited source files: every node, edge, direction, and state change
  must represent the implementation rather than merely render successfully.
- Are we missing any specifications in docs/\*\* or README files?
- Are any docs out of date? Should anything be moved to commands/skills/agents? Should anything be removed entirely?
- Are there any CLAUDE.md files that should be moved to `docs/**` or `README.md` files?
- Run the full `no-mistakes` `agents-md-max-size` repository scan and flag every `CLAUDE.md` with at
  least 170 lines or 11,500 characters, including files untouched by the selected improvement.
- When editing [CLIENT-PARITY-MATRIX.md](../../requirements/CLIENT-PARITY-MATRIX.md), keep closed
  issue citations separate from status claims: closed source issues document completed work, but
  every row with remaining Swift/.NET/web gaps must still name those gaps explicitly.

- `docs/checklists/**` is the canonical home for lifecycle and edit rules (commit, package.json, GitHub Actions). If these pages contain rules duplicated elsewhere, trim the duplicate to a pointer. The matching skills (`.agents/skills/git-commit-checklist`, `package-json-checklist`, `github-actions-checklist`) stay minimal — principles and pointers only. The `CLAUDE.md` pointers and `.codex/agents/**` adapters should stay in sync with the skill bodies.

Run `pnpm run lint:links`. Add improvements to lychee.toml or ci/lint-links.sh only when needed for the selected docs improvement.
