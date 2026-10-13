# report-integrity

Source entrypoint: [backend/services/report-integrity/README.md](../../../../../backend/services/report-integrity/README.md)

Detects and flags suspected mass-report campaigns. When a threshold of distinct reporters
file pending reports against the same entity within a rolling window, a `report_integrity_flags`
row is created for moderator review. Admins can penalise confirmed bad-faith reporters via
`report_abuse_penalties`, which sets `users.bad_faith_reporter_at` and lowers their trust tier.

## Data model

- `report_integrity_flags` — one flag per (entity, flag_type) while unresolved; deduped by partial unique index.
- `report_integrity_flag_reporters` — one row per (flag, reporter) captured at detection; deleted with the flag or the reporter. `details.reporter_user_ids` is never stored; flag reads rebuild it from these rows.
- `report_abuse_penalties` — one row per (reporter, source_flag); cleared when revoked.
- `users.bad_faith_reporter_at` — denormalised timestamp set/cleared alongside penalties to feed `computeTrustTier`.

## Key functions

| Function                                         | Description                                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `detectMassReportCampaign(entityType, entityId)` | Count distinct pending reporters in window; return `{ flagged, reporter_count, new_account_reporter_percent, reporter_user_ids }` |
| `createReportIntegrityFlag(...)`                 | Insert flag and its reporter rows in one statement with `ON CONFLICT DO NOTHING` dedup                                            |
| `applyReportAbusePenalty(adminId, flagId)`       | Atomically resolve + insert penalties; return the updated flag; stamp `bad_faith_reporter_at`; invalidate JWTs                    |
| `getReportIntegrityFlagByIdFromPrimary(id)`      | Exact primary-pool flag read for post-mutation reconciliation                                                                     |
| `getReportAbusePenalties(options)`               | Scoped-cursor penalty ledger with status, user, and source-flag filters                                                           |
| `getReportAbusePenaltyByIdFromPrimary(id)`       | Exact primary-pool penalty read for post-mutation reconciliation                                                                  |
| `revokeReportAbusePenalty(adminId, penaltyId)`   | Revoke penalty; clear `bad_faith_reporter_at` if last active penalty                                                              |

Flag and penalty cursors bind the `id DESC` boundary to their resource and complete normalized
filter set and reject unscoped simple cursors. Revocation
returns the authoritative updated penalty plus the legacy `penaltyId` and `userId` fields. The
transaction locks the penalized user before its final active-penalty check, so concurrent
revocations clear the trust-tier stamp and issue one JWT invalidation when the last penalty ends.

## Configuration

See `config.mts` for `MASS_REPORT_THRESHOLD`, `MASS_REPORT_WINDOW_MINUTES`, and `NEW_ACCOUNT_AGE_DAYS`.

## Internal selected flag batches

The flag list service accepts an internal `ids` selection of at most 100 UUID entries. It
validates, lowercases, deduplicates and sorts a fresh set, then applies that set together with
status and cursor filters. An empty selection returns no rows; omitting `ids` retains the
global list. Missing selected flags are omitted.

Selected cursors bind SHA-256 of the canonical normalized set as well as resource, status and
ordering. Reordered or duplicate-equivalent inputs continue the same selection; changing or
omitting the selection rejects its cursor. Unfiltered scope serialization remains unchanged.
The digest binds filter consistency; it does not authorize access.

This option stays internal. REST handlers construct the existing status/cursor/limit options.
Admin tools forward their arguments directly after validating schemas with
`additionalProperties: false`; their public parameter sets and authorization are unchanged.
