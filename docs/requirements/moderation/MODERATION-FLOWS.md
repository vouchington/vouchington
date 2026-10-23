# Moderation Flows

The platform moderates in layers. Non-admin user-created posts go through an automated clearance
pipeline (spam and policy screening, then LLM agents) before becoming visible. Admin-created
non-story posts are trusted on create, but community approval requirements can still hold a
community-published post for manual approval, and a later edit resets an admin post into the
normal pipeline. User reports are the manual escalation path. Community owners and moderators have
community-scoped tools, and site admins have global control.

## Where each concern lives

- Content policy keys, severity, and recommended actions: `ts-shared/utils/moderation-policy.mts`.
- User reports and the review queue: [Reporting](./REPORTING.md), with
  [Report Judgements](./REPORT-JUDGEMENTS.md) for AI recommendations.
- Appeals and legal disputes: [Moderation Appeals](./MODERATION-APPEALS.md) and
  [Review Disputes](./REVIEW-DISPUTES.md).
- Copyright cases: [Copyright Notices](./COPYRIGHT-NOTICES.md), a separate legal lifecycle.
- Automated actors in audit trails: [Moderation System Users](./MODERATION-SYSTEM-USERS.md).
- Aggregate dashboards: [Moderation Analytics](./MODERATION-ANALYTICS.md).
- Penalties: Penalties.
- Services and queues: the architecture docs and package READMEs under `backend/services` and
  `backend/queues`.

## Reports

**Flow:** a report creates or updates one pending row; see [Reporting](./REPORTING.md).

Queue claims and disturbing-media reveals are short-lived operating state. The daily retention
sweep removes stale entries after their claim and exposure windows, while a renewed claim or recent
reveal stays available. Moderation cases, reports, and appeals keep their separate durable lifecycle;
copyright evidence follows [its own retention policy](./COPYRIGHT-NOTICES.md#evidence-retention).

## Paid Transparency Projection

The paid transparency API is an aggregate release, not a moderation queue or a community record
feed. It applies the shared delay, cohort suppression, and rounding before data leaves
`@services/moderation-analytics`; see [Moderation Analytics](./MODERATION-ANALYTICS.md).
