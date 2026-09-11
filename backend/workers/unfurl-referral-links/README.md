# Unfurl Referral Links Worker

Worker package for the AMEX referral link unfurl flow: capturing a parent link's minted
redirect params, constructing per-card child referral links, self-healing stuck unfurls, and
removing children when their owner loses paid tier.

## Jobs

- `unfurl_referral_link` — runs `runReferralLinkUnfurl(parentLinkId)` (idempotent; re-crawls,
  re-constructs children, reconciles).
- `unfurl_referral_links_dispatcher` — runs `dispatchUnfurlReferralLinks()`, re-enqueueing parents
  stuck requested-but-not-completed.
- `remove_unfurled_children_for_user` — soft-deletes a user's unfurled children after they lose
  Plus/Pro tier (membership downgrade hook backstop; the authoritative removal path is the
  query-time membership filter on the public referral surfaces).

## Exports

- `unfurlReferralLinks` - worker instance for the `unfurl_referral_links` queue.

## Related

- Queue surface: [../../queues/unfurl-referral-links/README.md](../../queues/unfurl-referral-links/README.md)
- Worker entrypoint: [../../entrypoints/worker-cpu/README.md](../../entrypoints/worker-cpu/README.md)
