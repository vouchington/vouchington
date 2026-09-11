# Memberships reference

[Back to Memberships](memberships.md)

## Contribution Gating (Anti-Bot)

To prevent bot flooding (as seen when Digg relaunched), new free accounts are gated from contributing for the first 7 days.

A successfully identity-verified Free user bypasses only this seven-day publication-age gate. Email
verification, CAPTCHA, suspension, duplicate-ID handling, contribution limits, and every other
abuse control remain in force.

### Decision Tree

1. **Admin** → always allowed
2. **Active paid member** (plus/pro, status `active` or `past_due`) → always allowed
3. **Account < 7 days old** → post creation and rating not allowed (reason: `account_too_new`)
4. **Has verified non-disposable email** → allowed
5. **No verified email** → contribution not allowed (reason: `email_verification_required`)

### Gated Actions

- Creating posts
- Rating posts

### NOT Gated (passive/personal actions)

- Follow/unfollow users, topics, RSS feeds
- Bookmarks
- Profile updates
- Notification preferences

### Contribution Limits

Contribution cooldowns and daily quotas are action-specific and vary by user tier. They are
runtime-configurable through DynamicConfig namespace `contribution-rate-limits`.

See [CONTRIBUTION-LIMITS.md](../trust-safety/CONTRIBUTION-LIMITS.md) for the canonical matrix.

### Vote Low-Weighting

Votes from accounts less than 7 days old (without paid membership) are stored but assigned minimal weight in rankings. This prevents bot floods from gaming scores while still allowing fresh verified-email accounts to vote.

### API Endpoint

`GET /api/v1/my/contribution-status` returns the current user's gating status and daily quota:
Pass `?action=<action>` to return the action-specific limit status for a create surface.

```json
{
  "contribution_status": {
    "allowed": false,
    "reason": "account_too_new",
    "gated_until": "2026-04-08T00:00:00.000Z"
  },
  "daily_quota": {
    "used": 3,
    "limit": 10
  }
}
```

See [backend/services/contribution-gating/](../../../backend/services/contribution-gating/README.md) for the implementation.

See [docs/requirements/trust-safety/trust-system.md](../trust-safety/trust-system.md) for the full trust system design.

### UI Behavior

When `contribution_status.allowed === false`, create pages **must not render the form**. Instead render `<ContributionGatedCta status={...} actionNoun='...' />` (`web/components/posts/contribution-gated-cta.tsx`) in place of the form.

CTA behavior by reason:

| `reason`                      | Primary action                  | Secondary action                             |
| ----------------------------- | ------------------------------- | -------------------------------------------- |
| `account_too_new`             | "View plans" → `/plans`         | —                                            |
| `email_verification_required` | "Verify email" → `/my/identity` | "Or upgrade to skip verification" → `/plans` |
| _(unknown/none)_              | "View plans" → `/plans`         | —                                            |

Affected routes: `/discussions/create`, `/reviews/create`, `/data-points/create`. Each global
create route also accepts `community=<slug>` and autoselects the community only when the
authenticated user is eligible to create that post type there.

## Related

- [Web rules](../../../web/CLAUDE.md) — UI, routing, and client conventions
- [Backend rules](../../../backend/CLAUDE.md) — service, API, and data conventions

- Service: [backend/services/memberships/README.md](../../../backend/services/memberships/README.md)
- Job queue: [backend/queues/memberships/README.md](../../../backend/queues/memberships/README.md)
- API routes: [backend/api/v1/memberships/README.md](../../../backend/api/v1/memberships/README.md)
- Stripe service: [backend/services/stripe/README.md](../../../backend/services/stripe/README.md)
- Database migrations: `backend/data-stores/psql/migrations/0170-*`
