---
name: postgres-schema-design
description: Design Vouchington PostgreSQL schemas using the canonical database rules.
---

# Vouchington PostgreSQL Schema Design Adapter

## Canonical skill (required)

Claude Code and Codex load `vouchington-database:postgres-schema-design`; if that canonical plugin
source is unavailable or unreadable, read
`node_modules/vouchington-tooling/skills/postgres-schema-design/SKILL.md` instead. Grok, Cursor, and
OpenCode read that installed skill path. Resolve supporting resources relative to the selected
canonical skill's directory. Stop if neither canonical source is readable; never apply this adapter
alone.

## Vouchington additions

- Read [PostgreSQL schema rules](../../../docs/development/postgres-schema-rules.md) for R1–R7 and
  the [prelaunch relational-storage rules](../../../docs/development/postgres-schema-rules.md#prelaunch-relational-storage),
  including retained identities. Keep the canonical document authoritative; do not copy its rules
  here.
- Follow [PostgreSQL instructions](../../../backend/data-stores/psql/AGENTS.md) for creator,
  migration, query, and fresh-bootstrap requirements.
- Follow the [one-current-contract rule](../../../AGENTS.md): change canonical creators and current
  callers together; do not add backfills, compatibility paths, or upgrade-only migrations.
- Consult the PostgreSQL guard entries in [`.no-mistakes.yml`](../../../.no-mistakes.yml) when
  changing or reviewing schema enforcement.
