# Voucha

- **One current contract:** Prelaunch: never add, keep or request compatibility paths for
  historical stored data, payloads or schemas; rewrite producers, consumers and the
  canonical schema together and remove replaced paths. Keep external protocols, security key
  rotation, exact replay envelopes where those contracts actually require them, and fresh-bootstrap
  safety. Released native clients are the exception: producer changes ship first and stay
  backward compatible with them, never in lockstep with a client adoption PR. Add fields, codes and
  copy with pending native claims; anything a released client cannot read yet must fall back to
  behavior it already handles ([parity matrix](docs/requirements/CLIENT-PARITY-MATRIX.md)).
- Non-main databases and Valkey are disposable; main's shared database is guarded.
- No local AST parsers; ask a human first. Voucha-specific parsing and Oxlint plugins go in
  `vouchington-tooling`, generic rules in `no-mistakes`; ast-grep and Oxlint rules may live here.
  Never enable a rule that tsc or a higher check tier already enforces.
- Delete tests of dependencies, even our own packages.
- Local skills live in `.agents/skills/<name>/SKILL.md` (new ones named `vouchington-*`) and are
  linked with `pnpm exec vouchington link-skill <name> --source-root .agents/skills --target-root .claude/skills`;
  never vendor or adapt upstream skills.
- [Docs](docs/README.md) hold why, impact, architecture, runbooks, and unenforced invariants.
