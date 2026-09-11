# Moderation Flows reference

[Back to Moderation Flows](MODERATION-FLOWS.md)

## Overview

The platform uses a multi-layered moderation system. Non-admin user-created posts go through an
automated clearance pipeline before becoming visible. Admin-created non-story posts are trusted on
create for clearance and automated moderation; community approval requirements, including
post-approval-required communities and raid mode, can still hold community-published posts for
manual approval. Later edits reset admin-created posts into the normal clearance pipeline. User
reports provide a manual escalation path. Community owners/moderators have tools for
community-scoped moderation. Site admins have global control.

## Subsystem Map

| Subsystem                                | Requirements                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Post clearance, spam, OpenAI, LLM agents | This document and [Post Moderation](./POST-MODERATION.md)                                                |
| User reports and queue                   | [Reporting](./REPORTING.md)                                                                              |
| Community bans                           | [Community Bans](./COMMUNITY-BANS.md)                                                                    |
| Community restrictions / raid mode       | [Community Restrictions](./COMMUNITY-RESTRICTIONS.md)                                                    |
| User warnings                            | [User Warnings](./USER-WARNINGS.md)                                                                      |
| Moderator notes                          | [Moderator Notes](./MOD-NOTES.md)                                                                        |
| Modmail                                  | [Modmail](./MODMAIL.md)                                                                                  |
| Ban evasion                              | [Ban Evasion](./BAN-EVASION.md)                                                                          |
| Unified modlog                           | [Modlog](./MODLOG.md)                                                                                    |
| Moderation analytics                     | [Moderation Analytics](./MODERATION-ANALYTICS.md)                                                        |
| AI usage cost tracking                   | [§ 4. LLM Agent Moderation](reference-moderation-flows-4-llm-agent-moderation.md#4-llm-agent-moderation) |
| Report integrity                         | [Report Integrity](./REPORT-INTEGRITY.md)                                                                |
| AI report judgements                     | [Report Judgements](./REPORT-JUDGEMENTS.md)                                                              |
| Penalties                                | [Penalties](../trust-safety/PENALTIES.md)                                                                |
| Automated actors                         | [Moderation System Users](./MODERATION-SYSTEM-USERS.md)                                                  |
| Review disputes                          | [Review Disputes](./REVIEW-DISPUTES.md)                                                                  |
| Moderation appeals                       | [Moderation Appeals](./MODERATION-APPEALS.md)                                                            |
| Moderation queue claims                  | [§ Moderation Claims](reference-moderation-flows-6-user-reports.md#moderation-claims)                    |
| Internal mod discussion threads          | [§ Moderation Threads](reference-moderation-flows-6-user-reports.md#moderation-threads)                  |
| Moderator exposure / break tracking      | [§ Moderation Exposure](reference-moderation-flows-6-user-reports.md#moderation-exposure)                |
| Moderator training feedback              | [§ Moderation Training](reference-moderation-flows-6-user-reports.md#moderation-training)                |
