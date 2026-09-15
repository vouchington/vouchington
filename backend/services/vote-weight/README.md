# vote-weight

Calculates and manages per-user vote weights used to scale voting power on posts, topics, hostnames, RSS feed items, entity relations, and agent moderations.

## Overview

A user's vote weight starts at `1.0` and is multiplied by factors based on the criteria below. Accounts less than 7 days old (without paid membership or admin role) receive a base weight of `0.01` (`WEIGHT_NEW_ACCOUNT`) to ensure downstream functions work while limiting new account influence. Active penalties still apply, so the effective weight may be lower than `0.01`.

- **Auth diversity** — having multiple distinct authentication methods (email, phone, passkey, OAuth providers)
- **OAuth account age** — having 2+ OAuth providers connected for 1 or 5+ years
- **Account age** — stacking multipliers at 30 days, 1 year, 2 years, and 5 years
- **Membership plan** — `plus` (50×), `premium` (50×, legacy equals Plus), or `pro` (200×)
- **Admin role** — 10,000×, takes precedence over all subscription multipliers

## Functions

- `calculateVoteWeight(factors)` — pure function; computes weight from a `VoteWeightFactors` object
- `gatherVoteWeightFactors(userId)` — single CTE query fetching all factors plus current DB state
- `recalculateUserVoteWeight(userId, opts?)` — gathers factors, computes weight, writes result; respects admin overrides unless `forceRecalculate: true`
- `adminSetVoteWeight(userId, weight)` — sets weight and stamps `vote_weight_admin_set_at`
- `adminClearVoteWeight(userId)` — clears the admin override; caller should enqueue recalculation
- `enqueueElectionUpdatesForUser(userId)` — fire-and-forget; re-enqueues election stats jobs for all entities the user has voted on
- `findUsersNeedingVoteWeightRecalculation(afterId, limit)` — cursor-based scan for users whose weight is stale relative to age thresholds or current membership authority

## Access Control

Vote weight values and configuration are **admin-only**. Non-admin users must never be able to view or modify vote weights directly. The API endpoints (`PUT`/`DELETE /api/v1/users/:userId/vote-weight`) require the `administrator` role.

## Admin Override

When `vote_weight_admin_set_at` is set, `recalculateUserVoteWeight` returns the existing weight unchanged unless called with `forceRecalculate: true`, which also clears the admin stamp atomically.

## Related

- [backend/queues/vote-weight/README.md](../../queues/vote-weight/README.md)
- [backend/services/vote-integrity/README.md](../vote-integrity/README.md)
