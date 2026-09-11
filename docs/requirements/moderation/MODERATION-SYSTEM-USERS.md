# Moderation System Users

Moderation automation uses seeded system users so audit trails show a stable actor instead of `NULL` or the affected user.

## Users

| Username              | Purpose                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `automod`             | Platform automation for post clearance rejection, automated review-queue moves, agent unpublish, image auto-removal, and automated vote-weight penalties |
| `ban-evasion`         | Ban-evasion detector reports; this identity drives report redaction                                                                                      |
| Moderator agent slugs | Per-agent authorship for configured moderator agents                                                                                                     |

System users are seeded by `backend/data-stores/psql/config-driven/0010-00-01-seed-agents.mts`. `automod` is a plain system user, not an administrator, and must not be routed through moderator authorization gates.

## Attribution Rules

- Use `automod` for automated writes with an actor column.
- Keep `ban-evasion` reports on the `ban-evasion` user.
- Do not invent per-detector users unless a UI or query has a distinct product need.
- Tables without actor columns, such as AI judgement tables, rely on structural attribution instead.

See also: [Modlog](./MODLOG.md).
