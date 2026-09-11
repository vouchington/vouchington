# Web Requirements

Feature specifications, rules, and policies for the Voucha web product.

**Structure:** cross-cut matrices (files that every feature doc links to) live at this folder's
root. Feature-specific requirements live in domain subfolders. The root `CLAUDE.md` "Key
References" section points directly at the root-level matrices — moving them would require updating
those pointers. Files in `moderation/` are additionally guard-pinned; see
[moderation/CLAUDE.md](./moderation/CLAUDE.md).

## Cross-Cut Matrices

| File                                                           | Description                                                                                                                |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [Client Parity Matrix](./CLIENT-PARITY-MATRIX.md)              | Web vs. Swift vs. .NET user-facing functional UI parity; cross-cutting capabilities, domain surfaces, and active gaps      |
| [Client Feature Parity Contract](./client-feature-parity.json) | Machine-readable capability status, requirement, UI, behavioral/source-audit test, route/API evidence, and issue ownership |
| [Entity × Action Matrix](./ENTITY-ACTION-MATRIX.md)            | Cross-cut entity × surface × action (Table A) and entity × action × description (Table B); known gaps                      |
| [Entity × Lifecycle Flow Matrix](./ENTITY-LIFECYCLE-MATRIX.md) | Create, Edit, Delete, Archive, Approve flows per entity with authorization tiers and entry points; known gaps              |
| [URL-Routable Entity Catalog](./ENTITIES.md)                   | Canonical entity → URL helper mapping; tracks which entities have helpers and which are gaps                               |
| [Admin Navigation Matrix](./ADMIN-NAVIGATION-MATRIX.md)        | Admin-only entity pages, actions, and navigation paths (sidebar, command palette, per-entity asides); known gaps           |
| [Entity Anatomy](./anatomy/README.md)                          | Per-entity data shape, lifecycle states, surfaces, and actions                                                             |

## Domain Clusters

### Moderation

- [Moderation docs](./moderation/README.md) — pipeline, reports, appeals, bans, warnings, audit log, and AI review
- [User Flow Test Matrix](./user-flows/README.md) — key user flows for sources, posts, and topics × persona × Playwright coverage matrix

### Trust & Safety

- [Trust & Safety docs](./trust-safety/README.md) — trust system, vote integrity, vote weight, contribution limits, and penalties

### Users

- [Users docs](./users/README.md) — profiles, settings, privacy, account deletion, memberships, and API keys
- [Provider-neutral membership billing PRD](./users/reference-memberships-store-billing-prd.md) — accepted pre-launch provider, entitlement, recovery, and rollout contract

### Community

- [Community docs](./community/README.md) — communities, community comments, and curated lists

### Content

- [Content docs](./content/README.md) — posts, comments, topics, tags, news, stories, sources, podcasts, RSS feeds, and content blocking

### Navigation

- [Navigation docs](./navigation/README.md) — routes, navigation intents, UI components, keyboard shortcuts, accessibility, and mobile

### SEO

- [SEO docs](./seo/README.md) — SEO requirements, website specifications, and reference resources

### Security

- [Security docs](./security/README.md) — security policy, authentication UI, and Next.js CVE tracking

### Admin

- [Admin docs](./admin/README.md) — CRM, customer support, growth dashboard, and landing page analytics

### Platform

- [Platform docs](./platform/README.md) — API performance, job replayability, and data points spec

## Related

- [Documentation index](../README.md) — repo-wide docs index
- [Web rules](../../web/CLAUDE.md) — frontend requirements implementation conventions
- [Backend rules](../../backend/CLAUDE.md) — backend requirements implementation conventions
