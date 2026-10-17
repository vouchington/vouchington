# Moderation

Content moderation policy, reports, appeals, and legal cases. Mechanics (bans, warnings, modlog,
queues) are read from `backend/services` and the architecture docs.

## Documents

| File                                                      | Description                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Moderation Flows](./MODERATION-FLOWS.md)                 | Moderation layers and where each concern lives                                    |
| [Moderation Policy Matrix](./MODERATION-POLICY-MATRIX.md) | Platform content policy keys, labels, surfaces, severity, and recommended actions |
| [Moderation Analytics](./MODERATION-ANALYTICS.md)         | Why paid transparency is a separate aggregate projection                          |
| [Moderation Appeals](./MODERATION-APPEALS.md)             | Why a human always sends appeal responses                                         |
| [Moderation System Users](./MODERATION-SYSTEM-USERS.md)   | `automod`, `ban-evasion`, and automated action attribution                        |
| [Reporting](./REPORTING.md)                               | Reportable entities, reasons, idempotency, and reporter privacy                   |
| [Report Judgements](./REPORT-JUDGEMENTS.md)               | AI report recommendations and human review                                        |
| [Review Disputes](./REVIEW-DISPUTES.md)                   | Verified-claimant legal dispute flow for reviews                                  |
| [Copyright Notices](./COPYRIGHT-NOTICES.md)               | Separate legal-case lifecycle, privacy boundary, and restoration timing           |

## Sync Rule

When moderation policy, report entity types, reason codes, or pipeline steps change, keep these
files in sync: `MODERATION-POLICY-MATRIX.md`, `REPORTING.md`, `MODERATION-FLOWS.md`,
`../navigation/ACTIONS.md`, and `REPORT-JUDGEMENTS.md`. See `AGENTS.md` in this directory for
the guard-pinned invariant.

## Reference index

- [Reportable entities](reference-reporting-reportable-entities.md)
- [Report reasons and idempotency](reference-reporting-report-reasons.md)
- [Reports API token mirror](../api/v1/reports/README.md)
