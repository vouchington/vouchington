# Membership plans and entitlements

[Back to Memberships](memberships.md)

This is the canonical internal contract for Free, Plus, and Pro. The public catalog is returned by
`GET /api/v1/memberships/plans`; domain services remain authoritative for authorization and limits.
Clients must render known catalog entries and ignore unknown entries so an older client remains safe.

## Prices

The plan cards use active membership SKUs, not prices embedded in client code. Current launch prices are:

| Plan | Monthly | Yearly |
| ---- | ------- | ------ |
| Free | $0      | $0     |
| Plus | $5      | $50    |
| Pro  | $10     | $100   |

## Approved public benefit language

Never publish vote-weight multipliers, an effective vote weight, or one numeric "contributions per
day" promise. Limits are action-specific and runtime-configurable. Public clients use qualitative
values such as Standard, More, Most, Higher, and Highest. The table below is the approved target
matrix. A client renders only the subset present in the live catalog; accepted rollout items do not
appear there until their owning service enforcement ships.

| Area                                                                    | Free                                                               | Plus        | Pro              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ | ----------- | ---------------- |
| Publish discussions, reviews, comments, data points, and review ratings | After the new-member wait unless a qualifying trust bypass applies | Immediately | Immediately      |
| Contribution capacity                                                   | Standard                                                           | More        | Most             |
| Manual topic tags and automatic post topics                             | Standard / none                                                    | More        | Most             |
| AI research requests                                                    | Standard                                                           | More        | Most             |
| API capacity                                                            | Standard                                                           | Higher      | Higher           |
| Post downvote counts                                                    | Hidden                                                             | Included    | Included         |
| Sanitized page and source crawl history                                 | Not included                                                       | Included    | Included         |
| AI moderation rules across communities the member moderates             | None                                                               | Up to 3     | Up to 10         |
| Eligible Amex all-cards link expansion                                  | Not included                                                       | Included    | Included         |
| Support service level                                                   | Standard                                                           | Priority    | Highest priority |

Browsing public content, creating communities, owning a public username/referral page, and ordinary
referral placement are Free baseline capabilities. Do not present them as paid differentiators.
Referral placement is explained in the referral-link article, not on the plans page.

## Membership lifecycle

Entitlements apply for `active` and `past_due` memberships. `paused`, `cancelled`, and `expired`
memberships receive Free entitlements. Cancellation preserves the account and contributions; paid
access continues only through the already-authorized billing period. Account deletion is a separate
flow with its own retention contract.

Every protected read and write evaluates current membership at its owning service boundary. Catalog
data never authorizes a request. The catalog builder rejects a benefit ID until that ID is registered
as enforced, and monotonic dynamic-config validators prevent Free limits from exceeding Plus or Plus
from exceeding Pro. An unlimited sentinel is greater than every finite limit.

## Private ranking and trust controls

Subscription status remains one private factor in vote-weight calculation. Paid members may have more
ranking influence, but clients and member APIs must not disclose multipliers, effective weights, or a
factor breakdown. Exact values live only in the admin/internal [vote-weight reference](../trust-safety/vote-weight.md).

Contribution access is not purchased trust. Email verification, identity verification, account age,
connected authentication, abuse controls, penalties, suspensions, CAPTCHA, and action-specific limits
continue to apply independently unless the rule below explicitly grants a narrow bypass.

## Accepted rollout rules

These rules are the activation contract for the child work under Plan #9373. A rule is added to the
public catalog only after its service enforcement and client behavior ship.

### Identity verification

- Identity verification uses Stripe Identity. Customer-paid verification remains config-priced; the
  current configured price is $5. Free accounts pay that fee for one provider attempt. Once Stripe
  has created that provider session, any later Free retry must be granted by an administrator through
  the user administration screen; the grant records its issuer and support note before it can be
  used. An abandoned Checkout is released and does not consume a paid entitlement or support grant.
- An `active` or `past_due` Plus or Pro member receives one lifetime provider attempt without payment.
  That attempt is $0 at Checkout and becomes consumed when the Stripe provider session is created,
  even if the provider later reports a terminal failure or cancellation. Recoverable retries in the
  same provider session do not consume a second attempt. A terminal retry needs a staff grant.
  Duplicate identity handling remains staff-only.
- A verified Free member bypasses only the new-member publication wait and the private new-account
  vote penalty. They keep Free action limits and may receive the separate verified-identity trust
  factor. Verification does not bypass verified email, the first-24-hour API clamp, CAPTCHA,
  suspension, duplicate-ID checks, abuse controls, endpoint authorization, or Free quotas.

### RSS following and topic enrichment

- A unique follower contributes crawl-demand weight Free 1, Plus 2, Pro 3 after redirect
  canonicalization. This changes global scheduling priority only; it promises neither a per-user SLA
  nor manual refresh access.
- Feeds followed by paid members receive the existing paid-follower topic enrichment. Present this as
  improved source discovery, not personalized results.

### Analytics, crawl transparency, and moderation transparency

- Owner landing-page analytics is Plus/Pro only. Collection continues regardless of viewer plan;
  downgrade hides retained analytics and re-upgrade restores access.
- Plus/Pro may read sanitized URL and RSS crawl history. URL history includes only crawl identity,
  timestamps, HTTP status, title, and language. RSS history includes only crawl identity, timestamp,
  and response code through cursor pagination. Extracted page content, metadata, links,
  request/response headers, hashes, crawler internals, parsed feed payloads, redirect targets, and
  crawl triggers remain administrator-only.
- Plus/Pro receive sanitized global moderation transparency. Member summaries appear 48 hours after a
  final stable decision, suppress cohorts smaller than 20, and round remaining counts to the nearest 5. Reporter identity, prompts, raw model reasoning, staff notes, and subject-level private data
  never appear. Owners, moderators, and administrators retain their separate privileged routes. A
  member's own appeal access remains Free.

### Referral links and support

- An eligible Amex parent link remains user-owned. Plus/Pro can expand it into card-specific child
  links. Child visibility follows current paid membership and direct child editing is never exposed.
- Support routing is Standard for Free, Priority for Plus, and Highest priority for Pro. Public copy
  describes the service level without exposing internal queue scores. This row is live in the public
  `benefit_catalog` as `support_service_level`.

## Related references

- [Membership feature limits](reference-memberships-feature-limits.md)
- [Contribution limits](../trust-safety/CONTRIBUTION-LIMITS.md)
- [Contribution gating and anti-bot rules](reference-memberships-contribution-gating-anti-bot.md)
- [Vote weight](../trust-safety/vote-weight.md)
- [Membership and Stripe lifecycle](reference-memberships-stripe-integration.md)
- [Referral-link anatomy](../anatomy/referral-link.md)
- [RSS crawling](../content/RSS-FEED-CRAWLING.md)
