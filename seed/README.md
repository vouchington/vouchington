# Seed Data

> **Local development only.** `pnpm run db:seed` must never run in staging or production —
> it exits non-zero if `NODE_ENV` is `production` or `staging`. Invariant data (system users,
> administrator, URL blacklist sources, communities, publisher-type topics) is seeded by
> config-driven generators that run on every `db:migrate`, including in production.

CSV topic seed files for local development and testing. Loaded by
[`backend/scripts/seeds/dev-seed.mts`](../backend/scripts/seeds/dev-seed.mts)
via `pnpm run db:seed`.

## CSV Files

| File                                  | Vertical             | Description                         |
| ------------------------------------- | -------------------- | ----------------------------------- |
| `ai-topics.csv`                       | AI                   | AI tools, models, and platforms     |
| `cars-topics.csv`                     | Cars                 | Automotive brands and models        |
| `credit-cards-and-banking-topics.csv` | Credit cards         | Credit cards, banking products      |
| `hardware-topics.csv`                 | Hardware             | Computer hardware and peripherals   |
| `media-publications-topics.csv`       | Media                | Publications, podcasts, newsletters |
| `referral-programs-topics.csv`        | Referral programs    | Referral and rewards programs       |
| `software-engineering-topics.csv`     | Software engineering | Dev tools, languages, frameworks    |
| `travel-topics.csv`                   | Travel               | Airlines, hotels, travel programs   |

## Usage

```bash
source .env
pnpm run db:seed   # loads all CSVs into the topics table
```

Seed data is idempotent — re-running will not create duplicate topics.

## Related

- Seed script: [../backend/scripts/seeds/dev-seed.mts](../backend/scripts/seeds/dev-seed.mts)
- PostgreSQL data store: [../backend/data-stores/psql/README.md](../backend/data-stores/psql/README.md)
