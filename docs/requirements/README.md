# Web Requirements

Product policy, business rules, and the decisions behind them. Behavior that code already shows
(routes, schemas, limits, component inventories) is not documented here.

**Structure:** the cross-repo parity contract lives at this folder's root, and the root `AGENTS.md`
points at it. Domain decisions live in subfolders. Files in `moderation/` are additionally
guard-pinned; see [moderation/AGENTS.md](./moderation/AGENTS.md).

## Cross-Cut Contract

| File                                                           | Description                                                                                        |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [Client Parity Matrix](./CLIENT-PARITY-MATRIX.md)              | How to read the web vs. Swift vs. .NET parity contract                                             |
| [Client Feature Parity Contract](./client-feature-parity.json) | Machine-readable capability status, requirement, UI, test, route/API evidence, and issue ownership |

## Domain Clusters

- [API design decisions](./api/README.md) — enumeration, disclosure, response, and federation decisions
- [Moderation docs](./moderation/README.md) — policy, reports, appeals, and copyright cases
- [User Flow Test Matrix](./user-flows/README.md) — key user flows × persona × Playwright coverage
- [Trust & Safety docs](./trust-safety/README.md) — trust system rationale
- [Users docs](./users/README.md) — settings, privacy, account lifecycle, memberships, and keys
- [Community docs](./community/README.md) — community comment scope
- [Content docs](./content/README.md) — provenance, topic typing, lists, and podcasts
- [Navigation docs](./navigation/README.md) — navigation policy, UI rules, and accessibility
- [SEO docs](./seo/README.md) — indexability and discovery rules
- [Security docs](./security/README.md) — security architecture, CSRF, and the OAuth authorization server
- [Platform docs](./platform/README.md) — API performance, job replayability, data points, and agent access

## Related

- [Documentation index](../README.md) — repo-wide docs index
- [Web rules](../../web/AGENTS.md) — frontend requirements implementation conventions
- [Backend rules](../../backend/AGENTS.md) — backend requirements implementation conventions
