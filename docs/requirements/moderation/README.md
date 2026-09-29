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
`../navigation/ACTIONS.md`, and `REPORT-JUDGEMENTS.md`. See `AGENTS.md` in this directory for
the guard-pinned invariant.

## Reference index

- [Built-In AI Agents](reference-built-in-ai-agents.md)
- [Community Moderation reference](reference-community-moderation-authorization.md)
- [Community Moderation reference](reference-community-moderation-moderation-queue.md)
- [Community Moderation reference](reference-community-moderation-overview.md)
- [Community Moderation reference](reference-community-moderation-slot-limits.md)
- [GET /api/v1/communities/:slug/agent-prompts](reference-get-api-v1-communities-slug-agent-prompts.md)
- [GET /api/v1/communities/:slug/posts/:postId/moderation-results](reference-get-api-v1-communities-slug-posts-postid-moderation-results.md)
- [Moderation Flows reference](reference-moderation-flows-2-spam-detection.md)
- [Moderation Flows reference](reference-moderation-flows-4-llm-agent-moderation.md)
- [Moderation Flows reference](reference-moderation-flows-5-community-moderation.md)
- [Moderation Flows reference](reference-moderation-flows-6-user-reports.md)
- [Moderation Flows reference](reference-moderation-flows-native-client-capability-boundary.md)
- [Moderation Flows reference](reference-moderation-flows-overview.md)
- [Moderation Flows reference](reference-moderation-flows-public-documentation.md)
- [Moderation Results](reference-moderation-results.md)
- [Moderation Flow × Persona × Test Matrix reference](reference-moderation-test-matrix-matrix.md)
- [Moderation Flow × Persona × Test Matrix reference](reference-moderation-test-matrix-personas-legend.md)
- [Moderation Flow × Persona × Test Matrix reference](reference-moderation-test-matrix-status-legend.md)
- [Moderation Flow × Persona × Test Matrix reference](reference-moderation-test-matrix-workstream-key.md)
- [POST /api/v1/communities/:slug/agent-prompts/:promptId/test](reference-post-api-v1-communities-slug-agent-prompts-promptid-test.md)
- [POST /api/v1/communities/:slug/agent-prompts](reference-post-api-v1-communities-slug-agent-prompts.md)
- [POST /api/v1/communities/:slug/automod/simulate](reference-post-api-v1-communities-slug-automod-simulate.md)
- [Post Moderation reference](reference-post-moderation-api-routes.md)
- [Post Moderation reference](reference-post-moderation-audit-trail.md)
- [Post Moderation reference](reference-post-moderation-authorization-matrix.md)
- [Post Moderation reference](reference-post-moderation-overview.md)
- [Post Moderation reference](reference-post-moderation-pages.md)
- [Prompt Management](reference-prompt-management.md)
- [Reporting & Content Moderation reference](reference-reporting-rate-limiting.md)
- [Reporting & Content Moderation reference](reference-reporting-report-reasons.md)
- [Reporting & Content Moderation reference](reference-reporting-reportable-entities.md)
