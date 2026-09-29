# Valkey Requests — notifications

Application-level Valkey calls issued **per job** on the shared singleton
clients. Excludes glide-mq stream ops (XADD/XREADGROUP/XACK on the worker's own
connections). See `predecessor-issue#4717`.

| Call site (service / file) | Client | Operation | Calls / job |
| -------------------------- | ------ | --------- | ----------- |
| (none)                     | —      | —         | 0           |

**Total per job:** 0

## Notes

- All notification job types (new follower, reply, mention, referral-click, etc.) are PSQL reads/inserts and push-delivery enqueues. `processReferralClickNotification` inserts a row and enqueues push delivery without calling URL upsert helpers or `invalidate.urls`. No application-level Valkey calls are made on the shared singleton clients.
