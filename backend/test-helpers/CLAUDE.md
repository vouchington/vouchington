# Test Helpers

Load [backend-vitest-test-authoring](../../.agents/skills/backend-vitest-test-authoring/SKILL.md)
before changing a backend test helper. Full helper APIs, entity-listener waits, fixture selection,
and dirty-database patterns live in [README.md](README.md).

## Scoped invariants

- Backend tests run against a dirty, parallel database and do not clean up shared rows. Use the
  randomized, ownership-scoped fixture patterns in [README.md](README.md).
- Tests must not import raw PostgreSQL helpers or `sql-template-strings`; expose focused setup and
  assertion functions here without re-exporting SQL methods.
- Keep backend helpers under this first-layer root; do not recreate feature-local helper
  directories or forwarding modules after moving a helper here.
- Keep entity-specific helpers in `entities/*.mts` and generic helpers in their narrow package owner.
- Keep test output clean: close resources and remove unexpected `console.*` output before handoff.

## See Also

- Helper APIs and examples: [README.md](README.md)
- [Backend context](../CLAUDE.md)
