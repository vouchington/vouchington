# @services/copyright-notices

Copyright notices are a distinct legal workflow. This package owns pure lifecycle rules and the
allowlisted member projection; PostgreSQL owns the durable legal aggregate introduced by migration
`0634-00-00-copyright-notices.sql`.

Layer 1 is deliberately inert at the API boundary. It provides transactional aggregate creation,
immutable submission and assessment records, deadline derivation, restriction/review transitions,
hold resolution, correspondence approval, and revision-fenced restore intents. It does not expose
intake routes, invoke agents, restrict media, or send correspondence. Later layers must use these
boundaries instead of treating a generic content report or ordinary appeal as a statutory notice.

## Invariants

- An ordinary appeal is not a US statutory counter-notice.
- The restoration clock starts at the immutable receipt time of the submission that a compliance
  assessment finds substantially compliant. Parsing and staff-approval time never move that clock.
- Restoration intent creation cannot occur before business day ten, before that exact restriction's
  human review, while another restriction is active, or after a target-specific qualifying court/CCB
  filing is received from the original claimant. Missing day fourteen escalates but does not prohibit
  an overdue restoration. The media service still performs the authoritative delivery check.
- Member responses are built from an explicit allowlist and only for accepted complaints. Callers
  must separately determine whether the viewer may see the target reference.
- Legal receipts, evidence, assessments, targets, and lifecycle events are immutable. Restriction
  lifts and action-intent completions are one-way transitions.
- `precheckCopyrightRestoration` is a non-authoritative pure helper.
  `createEligibleCopyrightRestoreIntent` locks the legal ledger and creates a preliminary fenced
  intent; it cannot authorize a media delivery change by itself.

The durable workflow and operator recovery contract are documented in
[`COPYRIGHT-NOTICES.md`](../../../docs/requirements/moderation/COPYRIGHT-NOTICES.md).
