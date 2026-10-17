# Moderation

Content moderation policy, reports, appeals, and legal cases. Mechanics (bans, warnings, modlog,
queues) are read from `backend/services` and the architecture docs.

## Documents

| File                                                    | Description                                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Moderation Flows](./MODERATION-FLOWS.md)               | Moderation layers and where each concern lives                          |
| [Moderation Analytics](./MODERATION-ANALYTICS.md)       | Why paid transparency is a separate aggregate projection                |
| [Moderation Appeals](./MODERATION-APPEALS.md)           | Why a human always sends appeal responses                               |
| [Moderation System Users](./MODERATION-SYSTEM-USERS.md) | `automod`, `ban-evasion`, and automated action attribution              |
| [Reporting](./REPORTING.md)                             | Reporter privacy and the review queue                                   |
| [Report Judgements](./REPORT-JUDGEMENTS.md)             | AI report recommendations and human review                              |
| [Review Disputes](./REVIEW-DISPUTES.md)                 | Verified-claimant legal dispute flow for reviews                        |
| [Copyright Notices](./COPYRIGHT-NOTICES.md)             | Separate legal-case lifecycle, privacy boundary, and restoration timing |
