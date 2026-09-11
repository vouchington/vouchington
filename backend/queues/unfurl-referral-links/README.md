# unfurl-referral-links

Unfurls a pasted AMEX referral link (all-cards or single-card) into per-card child referral
links, gated behind Plus/Pro membership.

See [docs/requirements/users/REFERRAL-LINKS.md](../../../docs/requirements/users/REFERRAL-LINKS.md)
for the entity-level unfurl behavior and [docs/overview/architecture/crawling.md](../../../docs/overview/architecture/crawling.md)
for the browser-crawl flow this reuses to capture the parent's post-redirect params.

## Processors

| Queue                   | Job                                 | Schedule                                                  |
| ----------------------- | ----------------------------------- | --------------------------------------------------------- |
| `unfurl_referral_links` | `unfurl_referral_links_dispatcher`  | Hourly                                                    |
| `unfurl_referral_links` | `unfurl_referral_link`              | Enqueued by `requestReferralLinkUnfurl` or the dispatcher |
| `unfurl_referral_links` | `remove_unfurled_children_for_user` | Enqueued by the membership downgrade hook                 |

The dispatcher runs hourly rather than the weekly crawl-referral-links cadence because it
self-heals a user-facing, actively-awaited action (a paid user waiting on their unfurl), not a
passive link health check.

## Architecture

1. `requestReferralLinkUnfurl` (paid gate + ownership checks) persists intent
   (`unfurl_requested_at`) before enqueueing `unfurl_referral_link`, deduplicated per parent link
   id (debounce).
2. `unfurl_referral_link` runs `runReferralLinkUnfurl`: crawls the parent URL to capture its
   post-redirect params, constructs per-card child URLs from the seeded Amex card-slug catalog,
   creates/upserts children, and reconciles away any card no longer resolvable. Idempotent —
   re-running is the primary freshness mechanism for Amex's rotating tokens.
3. `unfurl_referral_links_dispatcher` re-enqueues parents stuck requested-but-not-completed
   (backed by a partial index), recovering from a lost/crashed job.
4. `remove_unfurled_children_for_user` soft-deletes a user's unfurled children after a membership
   downgrade/expiry event. This is cleanup only — the query-time membership filter on the public
   referral surfaces is the authoritative visibility backstop (it also catches time-based granted
   membership expiry, which fires no event).

## Related

- Service: `@services/referral-link-unfurl`
- Worker: `@workers/unfurl-referral-links`
- Browser-crawl system: `@services/browser-crawl`
- Parent: [../CLAUDE.md](../CLAUDE.md)
- [docs/requirements/users/REFERRAL-LINKS.md](../../../docs/requirements/users/REFERRAL-LINKS.md)
