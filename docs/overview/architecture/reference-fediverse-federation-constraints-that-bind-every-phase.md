# Fediverse Federation reference

[Back to Fediverse Federation](fediverse-federation.md)

## Constraints that bind every phase

- New `topic_type` must **justify itself** with type-specific behavior (extension table, validation,
  and routing) — `fediverse_instance` qualifies (software/protocol/NodeInfo metadata, instance-specific
  routing/filtering, integration decision). Adding it triggers the
  [Finite Enum Ripple Checklist](../../development/finite-enum-ripple-checklist.md).
- Pre-launch: **edit migrations in place**; no new ALTER-TABLE migrations for the enum/columns.
- External calls: `/* no-mistakes: integration=<provider> */`, `undici` +
  `@modules/utils/http`, **queued** (no for-loop /
  `Promise.all` fan-out of external calls) — request-path fediverse search is the documented exception;
  see below.
- The product `fediverse` flag is **frontend-only**; backend routes stay mounted. Separate
  DynamicConfig rollout flags choose direct versus HTTP CONNECT proxy transport without changing
  the public contracts.
- Secrets (AP private keys, Bluesky OAuth tokens) go through `@modules/token-secrets`; never persist
  raw.
- **Client parity**: every user-facing surface moves web + Swift + .NET + `api-fixtures/v1` together.
- Append-only moderation/toggle state (the integration allowlist): history rows + trigger-maintained
  denormalized status; never update in place, no "one active row" unique index.
