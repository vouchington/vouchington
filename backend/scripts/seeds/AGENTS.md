# Seed data

- Monthly-retention rows use guarded recent-day UUIDs from `recentSeedCrawlId()`: timestamp is the UTC day start of `now - 12h`. Preserve the intentional prior-day overlap during the first 12 UTC hours, including prior-month partitions at month boundaries.
