# Key User Flows × Persona × Test Matrix

Living document tracking Playwright spec coverage for each key user flow, organized by entity.
Update Status when specs land or flows change.

## Personas Legend

| Code | Role                                                            |
| ---- | --------------------------------------------------------------- |
| Anon | Anonymous / signed-out visitor                                  |
| RU   | Regular signed-in user (no special role)                        |
| CM   | Community moderator (role `moderator` in a community)           |
| CO   | Community owner (role `owner` in a community)                   |
| SM   | Site moderator (`moderator` role, distinct from SA)             |
| QA   | Developer QA (`developer` role, feature-flag update access)     |
| SA   | Site administrator (`administrator` role, full platform access) |

**Persona collapse by entity:**

- **Sources & Topics**: management is admin-only. SM has no elevated source or topic powers — personas collapse to **Anon / RU / SA** for these two. CM/CO matter only on `/communities/[slug]/*` scoped routes.
- **Posts**: moderation is genuinely tiered — Author (24 h edit window) → RU → CM/CO → SA. All 4 personas diverge meaningfully here.

## Status Legend

| Symbol | Meaning                                           |
| ------ | ------------------------------------------------- |
| ✅     | Fully covered by an existing Playwright spec      |
| 🟡     | Partially covered — at least one scenario missing |
| 🔴     | Gap — no Playwright spec covers this flow at all  |

## Entities

| Entity                  | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| [Sources](./sources.md) | RSS feed submit, follow, mute, admin management flows |
| [Topics](./topics.md)   | Topic browse, vouch, follow, admin management flows   |
| [Posts](./posts.md)     | Post create, vote, comment, mod queue, admin flows    |

## See Also

- [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md) — atomic engagement actions (vote, follow, save, etc.)
- [Entity × Lifecycle Flow Matrix](../ENTITY-LIFECYCLE-MATRIX.md) — create/edit/delete/approve lifecycle flows
- [Moderation Test Matrix](../moderation/MODERATION-TEST-MATRIX.md) — moderation-specific flows and persona boundaries
- [Signed-out Actions](../navigation/SIGNED_OUT_ACTIONS.md) — auth-state × entity × action visibility

## Local Setup Notes

For local browser/QA setup, see the [Chrome QA skill](../../../.agents/skills/chrome-qa/SKILL.md).
For `https://staging.voucha.ai`, see the [staging QA skill](../../../.agents/skills/staging-qa/SKILL.md).
The standard `--all` persona set includes `qa-developer@voucha.ai` with the `developer` role for
Dynamic Config and feature-flag checks.
