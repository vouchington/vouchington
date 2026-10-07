# Crawl Referral Links Worker

Source entrypoint: [backend/workers/crawl-referral-links/README.md](../../../../../../backend/workers/crawl-referral-links/README.md)

Worker package for referral link crawl dispatch and individual referral link crawl jobs.

Fetch success, CSR fallback and crawl-health error handling live in
[processor outcomes](../../../../../../backend/workers/crawl-referral-links/processors/outcomes.mts),
which the job dispatcher imports directly. The same handlers update real referral-link state and
enqueue browser fallback jobs.

## Exports

- `crawlReferralLinks` - worker instance for the `crawl_referral_links` queue.

## Related

- Queue surface: [../../queues/crawl-referral-links/README.md](../../crawl-referral-links/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../../backend/entrypoints/worker-cpu/README.md)
