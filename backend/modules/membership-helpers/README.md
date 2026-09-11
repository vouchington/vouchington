# @modules/membership-helpers

Pure helper functions for checking membership tier and status — no database access.

## Exports

### `isActiveMembership(m: Membership | null): boolean`

Returns `true` if the membership status is `'active'` or `'past_due'`. Grant expiry is
derived as `expired` by `view_memberships`; this helper does not re-interpret
`expires_at`. See [statuses](../../../docs/requirements/users/reference-memberships-membership-statuses.md).

### `hasPlusTier(m: Membership | null, now?: Date): boolean`

Returns `true` if the membership is active, the plan is `'plus'` or `'pro'`, and the
entitlement clock is open. Grants use `expires_at`; Stripe rows stay entitled after
period end. Pass `now` only in tests.

### `hasUnexpiredPlusTier(m: Membership | null, now?: Date): boolean`

Same paid-plan check as `hasPlusTier`, with an injectable clock for grant `expires_at`.
Stripe period end does not lapse the tier.

### `hasProTier(m: Membership | null): boolean`

Returns `true` if the membership is active and the plan is `'pro'`.

## Related

- Parent: [../README.md](../README.md)
- Memberships service: [../../services/memberships/README.md](../../services/memberships/README.md)
- Memberships requirements: [../../../docs/requirements/users/memberships.md](../../../docs/requirements/users/memberships.md)
