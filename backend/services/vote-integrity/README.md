# Vote Integrity Service

Business logic for detecting and acting on suspicious voting patterns.

## Functions

| Function                                    | Description                                                            |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| `detectVelocitySpike`                       | Checks for too many young-account votes in a short window              |
| `detectIpCorrelation`                       | Checks for multiple users voting from the same IP                      |
| `createVoteIntegrityFlag`                   | Inserts a flag (deduplicates unresolved flags)                         |
| `getVoteIntegrityFlags`                     | Cursor-paginated flag list with optional status filter                 |
| `getVoteIntegrityFlagByIdFromPrimary`       | Exact primary-pool flag read for mutation reconciliation               |
| `resolveVoteIntegrityFlag`                  | Marks a flag as resolved                                               |
| `applyVoteRingPenalty`                      | Applies multiplier penalties without resolving the source flag         |
| `revokeVoteWeightPenalty`                   | Revokes a penalty and enqueues vote weight recalculation               |
| `getVoteWeightPenalties`                    | Scoped-cursor penalty list with status, source, user, and flag filters |
| `getVoteWeightPenaltiesByFlagIdFromPrimary` | Primary-pool flag-scoped list for mutation reconciliation              |
| `getVoteWeightPenaltyByIdFromPrimary`       | Exact primary-pool penalty read for mutation reconciliation            |
| `currentUserCanReviewVoteIntegrityFlags`    | Authorization: admin only                                              |
| `currentUserCanApplyVoteRingPenalty`        | Authorization: admin only                                              |

## Config Thresholds

| Constant                        | Value | Description                                       |
| ------------------------------- | ----- | ------------------------------------------------- |
| `VELOCITY_SPIKE_THRESHOLD`      | 20    | Max young-account votes before flagging           |
| `VELOCITY_SPIKE_WINDOW_MINUTES` | 5     | Time window for velocity check                    |
| `YOUNG_ACCOUNT_AGE_DAYS`        | 30    | Max account age for "young" classification        |
| `IP_CORRELATION_THRESHOLD`      | 3     | Min distinct users from same IP before flagging   |
| `IP_CORRELATION_WINDOW_MINUTES` | 60    | Time window for IP correlation check              |
| `DEFAULT_PENALTY_MULTIPLIER`    | 0.2   | Vote weight multiplier applied to penalized users |

## Penalty Reasons

| Reason                     | Source                           | Stacks? | Notes                                                              |
| -------------------------- | -------------------------------- | ------- | ------------------------------------------------------------------ |
| `voting_ring`              | `applyVoteRingPenalty`           | No      | One penalty per flag, tied to `source_flag_id`                     |
| `blocked_hostname`         | `blockHostname`                  | No      | One per (user, hostname), tied to `source_hostname_id`, idempotent |
| `blocked_hostname_attempt` | `penalizeBlockedHostnameAttempt` | Yes     | Stacks per attempt; `source_hostname_id = NULL`                    |
| `referral_link_in_post`    | `penalizeReferralLinkInPost`     | No      | One per post, tied to `source_post_id`, idempotent                 |

The administrative flag ledger requests `source: 'flag'`, which is defined by the durable
`voting_ring` reason rather than a non-null `source_flag_id`; this keeps audit rows visible after
their source flag is deleted and its foreign key is cleared. Omitting `source` preserves the
all-source service behavior. Penalty cursors bind `id DESC` to every normalized filter.
Flag cursors are likewise scoped by resource, status, and ordering. Both lists accept legacy simple
UUID cursors during deployment compatibility, but reject a scoped cursor whose scope mismatches.
Filtered penalty results carry the exact `filter_scope` used to distinguish the flag ledger from
the generic all-source service response.

## Data Model

- **`vote_integrity_flags`** — Admin review queue with concrete target foreign keys. Relation
  targets use generated `(subject_id, relation_id)` pairs per relation table; service projections
  derive the existing `entity_relation_id` response field.
- **`vote_weight_penalties`** — Vote-weight penalties (user, multiplier, revocation state, `source_flag_id`, `source_hostname_id`)

## Related

- System: [`../../queues/vote-integrity/`](../../queues/vote-integrity/README.md)
- API: [`../../api/v1/vote-integrity/`](../../api/v1/vote-integrity/README.md)
- Docs: [`../../../docs/requirements/trust-safety/vote-integrity.md`](../../../docs/requirements/trust-safety/vote-integrity.md)
