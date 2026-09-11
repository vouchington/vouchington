# Seed Data

- Seed data in monthly-retention tables must use guarded recent-day UUIDs (`recentSeedCrawlId()`): derive the timestamp from the start of `now - 12h`'s UTC day. The first 12 UTC hours intentionally overlap the prior UTC day, and at month boundaries the prior month's partition.
