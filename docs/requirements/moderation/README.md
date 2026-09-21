# Moderation

Content moderation pipeline, policy, reports, appeals, bans, warnings, and audit trail.

## Documents

| File                                                      | Description                                                                       |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [Moderation Flows](./MODERATION-FLOWS.md)                 | Canonical end-to-end moderation pipeline and subsystem index                      |
| [Moderation Policy Matrix](./MODERATION-POLICY-MATRIX.md) | Platform content policy keys, labels, surfaces, severity, and recommended actions |
| [Moderation Analytics](./MODERATION-ANALYTICS.md)         | Queue, automod, workload, appeal, and first-post friction dashboards              |
| [Moderation Appeals](./MODERATION-APPEALS.md)             | Member appeals for bans, warnings, and post removals                              |
| [Moderation System Users](./MODERATION-SYSTEM-USERS.md)   | `automod`, `ban-evasion`, and automated action attribution                        |
| [Moderation Test Matrix](./MODERATION-TEST-MATRIX.md)     | Moderation flow × persona × test coverage tracking matrix                         |
| [Post Moderation](./POST-MODERATION.md)                   | Clearance, delete, archive, and community review queue                            |
| [Reporting](./REPORTING.md)                               | User report submission flow, entity types, reason codes, and moderation queue     |
| [Report Integrity](./REPORT-INTEGRITY.md)                 | Mass-report detection and trust penalties                                         |
| [Report Judgements](./REPORT-JUDGEMENTS.md)               | AI report recommendations and human review                                        |
| [Review Disputes](./REVIEW-DISPUTES.md)                   | Verified-claimant legal dispute flow for reviews                                  |
| [Copyright Notices](./COPYRIGHT-NOTICES.md)               | Separate legal-case lifecycle, privacy boundary, and restoration timing           |
| [Moderator Notes](./MOD-NOTES.md)                         | Private user notes for moderators                                                 |
| [Modmail](./MODMAIL.md)                                   | Community moderator messaging                                                     |
| [Modlog](./MODLOG.md)                                     | Unified `moderator_actions` audit trail                                           |
| [Ban Evasion](./BAN-EVASION.md)                           | Detection signals, system reports, confirm/dismiss flow                           |
| [Community Bans](./COMMUNITY-BANS.md)                     | Community-scoped ban lifecycle and enforcement                                    |
| [Community Restrictions](./COMMUNITY-RESTRICTIONS.md)     | Raid mode and temporary community restrictions                                    |
| [User Warnings](./USER-WARNINGS.md)                       | Warning issuance, records, and report linkage                                     |
| [Community Moderation](./community-moderation.md)         | Community post review, moderator prompts, and enforcement flow                    |

## Sync Rule

When moderation policy, report entity types, reason codes, or pipeline steps change, keep these
files in sync: `MODERATION-POLICY-MATRIX.md`, `REPORTING.md`, `MODERATION-FLOWS.md`,
`../navigation/ACTIONS.md`, and `REPORT-JUDGEMENTS.md`. See `CLAUDE.md` in this directory for
the guard-pinned invariant.
