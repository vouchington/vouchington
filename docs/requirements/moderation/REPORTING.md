# Reporting & Content Moderation

Users can report content they believe violates community standards. A confirmed report creates or
updates a pending `moderation_reports` row in the database. The canonical review queue is the
`moderation_reports` table itself; admin tooling reads pending rows directly. Report integrity checks
still run asynchronously after report creation or update.

See also:

- [Entity × Action Matrix](../ENTITY-ACTION-MATRIX.md) — Report listed in Table A and Table B for all four entities
- [Actions](../navigation/ACTIONS.md) — Report placement principles and per-entity tables
- [Signed-out Actions](../navigation/SIGNED_OUT_ACTIONS.md) — Report is auth-only, not rendered for signed-out users
- [Post Moderation rules](./POST-MODERATION.md) — authorization matrix, roles, and all moderation actions
- [Moderation Flows](./MODERATION-FLOWS.md) — full automated moderation pipeline that runs before and after user reports
- [How Moderation Works](../../../articles/how-moderation-works.md) — public-facing overview of the moderation system
- [Moderation Policy Matrix](./MODERATION-POLICY-MATRIX.md) — canonical policy registry (severity, appealEligible, recommendedAction) from which report reasons and AI content-policy categories both derive
- [Moderation Analytics](./MODERATION-ANALYTICS.md) — paid transparency releases delayed, suppressed, rounded report aggregates only

---

## Contents

- <a id="reportable-entities"></a>[Reportable entities](reference-reporting-reportable-entities.md)
- <a id="report-reasons-submission-flow-and-idempotency"></a>[Report Reasons, Submission Flow, and Idempotency](reference-reporting-report-reasons.md)
- <a id="rate-limiting-reporter-privacy-admin-queue-database-schema-and-deleted-targets"></a>[Rate Limiting, Reporter Privacy, Admin Queue, Database Schema, and Deleted Targets](reference-reporting-rate-limiting.md)
