# API Entrypoint

Starts the backend HTTP API process, applies request context/rate-limit/error handlers to the shared API app, and wires infrastructure-only endpoints such as health and dashboard integrations.

## Files

- `app.mts` - imports the shared API app and registers entrypoint-specific context, rate-limit, and error handlers.
- `serve.mts` - process startup entry point.
- `migrate.mts` - one-off schema migration entry point used by the deployment workflow.
- `verify-ipv6-egress.mts` - one-off IPv6 egress verification entry point.
- `valkey-admin.mts` - deployed, curated Valkey diagnosis and scoped recovery entry point.
- `context/` - request context helpers.
- `infra/` - infrastructure endpoints mounted outside the versioned API route docs.

## Route Groups

For a future split, route registration has three candidate sub-apps:

- Auth/session: `sessions-authentication` and `auth`.
- User-facing reads and writes: posts, topics, feeds, RSS feeds/items, users, bookmarks, my,
  communities, stories, recommended/trending surfaces, votes, memberships, referral links, images,
  conversations, entity relations, reports, friend recommendations, agents, webhooks, and markdown.
- Admin/infrastructure: blacklist, crawlers, hostnames, URLs, PostgreSQL, Valkey, dynamic config,
  feature-flag reads, admin, vote integrity, platform stats, landing pages, MQ, countries,
  individuals, households, topic recommendations, and attribution.

Keep the detailed route inventory in [`backend/api/README.md`](../../api/README.md) and use
`backend/api/v1/index.mts` as the executable source of truth.

## Valkey Admin Command

The distroless API image can run these ECS command overrides without a shell:

```text
valkey-admin.mts diagnose
valkey-admin.mts flush <concern> --confirm "FLUSH <environment> VALKEY <concern>" [--force]
```

`sessions` is the only concern that accepts and requires `--force`. Parsing and environment-bound
confirmation happen before Valkey modules load. Success writes one schema-version 1 JSON document
to stdout immediately after the operation completes, before quiet data-store cleanup. This
preserves evidence that a destructive operation happened even when cleanup fails; cleanup failure
still returns nonzero and must not be treated as proof that retrying is safe. A referenced
grace-period timer bounds a stuck close, then remains as an unref'd fallback for native handles that
survive cleanup. One-off signal cancellation is installed before dynamic data-store imports; a
SIGINT or SIGTERM during runtime initialization stays latched, prevents diagnosis or flushing from
starting after the import settles, and still awaits strict cleanup. During an in-flight operation,
the same signal stops cooperative cursor work and latches cancellation as the final outcome. The
command waits for that operation to settle before starting strict shutdown, so data-store clients
are never closed underneath active work. A result completed after cancellation is discarded, a
rejection remains observed, and success evidence is suppressed because exact completion is
uncertain. The ECS StopTask deadline and subsequent SIGKILL bound a truly uncooperative operation.
The command exposes no arbitrary Valkey command or pattern surface. Operators must use the tested launcher and procedure in the
[Valkey memory recovery runbook](../../../docs/operations/valkey-memory-recovery.md).

## Related

- API routes: [../../api/README.md](../../api/README.md)
- Local entrypoint rules: [CLAUDE.md](CLAUDE.md)
- Valkey admin service: [../../services/valkey-admin/README.md](../../services/valkey-admin/README.md)
