# Report Integrity

Report integrity detects and penalizes coordinated or bad-faith reporting.

## Scope

- Table: `report_integrity_flags`
- Penalty table: `report_abuse_penalties`
- Services: `backend/services/report-integrity/`

## Flow

```mermaid
flowchart TD
  Activity[Reporting activity] --> Signals[Detect mass-report signals]
  Signals --> Flag[(report_integrity_flags)]
  Flag --> Review[Moderator review]
  Review --> Dismiss[Dismiss flag]
  Review --> Penalize[Penalize reporters]
  Penalize --> Penalty[(report_abuse_penalties)]
  Penalty --> Trust[Stamp users.bad_faith_reporter_at]
  Trust --> JWT[Invalidate sessions so trust tier refreshes]
  Penalize --> Revoke[Later revocation clears active penalty]
  Revoke --> Reapply[Later confirmed offense can re-apply]
```

1. Reporting activity creates detection signals for mass-report patterns.
2. A flag stores the captured reporter IDs in `details.reporter_user_ids`.
3. A moderator resolves the flag as dismissed or penalized.
4. Penalizing inserts `report_abuse_penalties` rows and stamps `users.bad_faith_reporter_at`.
5. Revocation clears the trust-tier penalty state and invalidates sessions because trust tier is cached in JWT claims.

Flag-sourced report-abuse penalties are unique only while active, so a revoked penalty can be re-applied on a later confirmed offense.

Web, Swift, and .NET render the administrator-only report-integrity queue with pending, resolved,
and all filters. Each client can dismiss a flag or penalize its captured reporters, prevents
concurrent actions on the same flag, and replaces the row only with the API-confirmed response.
Penalty revocation is a separate backend lifecycle and is not part of the mapped integrity queue
surface. Vote-integrity resolution follows the same native queue boundary; see the
[Client Parity Matrix](../CLIENT-PARITY-MATRIX.md).

See also: [Penalties](../trust-safety/PENALTIES.md), [Reporting](./REPORTING.md).
