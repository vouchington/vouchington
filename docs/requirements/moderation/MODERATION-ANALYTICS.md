# Moderation Analytics

Moderation analytics gives site admins and community moderation teams a read-only view of queue
health, automod quality, human workload, appeal outcomes, and first-post friction. Because it is
read-only, native rendering of the same metrics is full parity; it says nothing about action
parity for reports, appeals, or review queues (see the
[Client Parity Matrix](./../CLIENT-PARITY-MATRIX.md)).

## Why paid transparency is a separate projection

Paying members can see aggregate moderation activity, but it must never become a moderation queue
or a feed of community records. Transparency therefore reads an immutable, aggregate-only release
projection rather than operational tables:

- Counts are delayed, small cohorts are suppressed, and released counts are rounded, so a single
  report or reporter cannot be re-identified.
- It exposes no user identities, reporter details, community identifiers, prompt text, raw AI
  output, or raw records.
- A released cohort survives hard deletion of its source rows or community.
- Access follows the member's current plan, including the paid period a cancelled membership
  still holds. The staff-scoped analytics endpoints keep their raw operational views and do not
  use this projection.

Moderation actions counted on the dashboard are the established moderation action families; the
broader staff audit covers other administrative operations that are not moderation workload.
