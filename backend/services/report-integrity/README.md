# report-integrity

Detects and flags suspected mass-report campaigns. When a threshold of distinct reporters
file pending reports against the same entity within a rolling window, a `report_integrity_flags`
row is created for moderator review. Admins can penalise confirmed bad-faith reporters via
`report_abuse_penalties`, which sets `users.bad_faith_reporter_at` and lowers their trust tier.

## Data model

- `report_integrity_flags` — one flag per (entity, flag_type) while unresolved; deduped by partial unique index.
- `report_abuse_penalties` — one row per (reporter, source_flag); cleared when revoked.
- `users.bad_faith_reporter_at` — denormalised timestamp set/cleared alongside penalties to feed `computeTrustTier`.

## Key functions

| Function                                         | Description                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `detectMassReportCampaign(entityType, entityId)` | Count distinct pending reporters in window; return `{ flagged, reporter_count, new_account_reporter_pct }`     |
| `createReportIntegrityFlag(...)`                 | Insert flag with `ON CONFLICT DO NOTHING` dedup                                                                |
| `applyReportAbusePenalty(adminId, flagId)`       | Atomically resolve + insert penalties; return the updated flag; stamp `bad_faith_reporter_at`; invalidate JWTs |
| `getReportIntegrityFlagByIdFromPrimary(id)`      | Exact primary-pool flag read for post-mutation reconciliation                                                  |
| `getReportAbusePenalties(options)`               | Scoped-cursor penalty ledger with status, user, and source-flag filters                                        |
| `getReportAbusePenaltyByIdFromPrimary(id)`       | Exact primary-pool penalty read for post-mutation reconciliation                                               |
| `revokeReportAbusePenalty(adminId, penaltyId)`   | Revoke penalty; clear `bad_faith_reporter_at` if last active penalty                                           |

Flag and penalty cursors bind the `id DESC` boundary to their resource and complete normalized
filter set, while accepting legacy simple cursors during deployment compatibility. Revocation
returns the authoritative updated penalty plus the legacy `penaltyId` and `userId` fields. The
transaction locks the penalized user before its final active-penalty check, so concurrent
revocations clear the trust-tier stamp and issue one JWT invalidation when the last penalty ends.

## Configuration

See `config.mts` for `MASS_REPORT_THRESHOLD`, `MASS_REPORT_WINDOW_MINUTES`, and `NEW_ACCOUNT_AGE_DAYS`.
