# @services/copyright-notices

Copyright notices are a distinct legal workflow. This package owns pure lifecycle rules and the
allowlisted member projection; PostgreSQL owns the durable legal aggregate introduced by migration
`0634-00-00-copyright-notices.sql`.

The package provides transactional aggregate creation, immutable submission and assessment records,
deadline derivation, restriction/review transitions, hold resolution, correspondence approval, and
revision-fenced restore intents. The intake layer adds structured form and preserved-email records,
but remains disabled by default with `COPYRIGHT_INTAKE_ENABLED`. Later enforcement and delivery
layers must use these boundaries instead of treating a generic content report or ordinary appeal as
a statutory notice.

Delivery obligations are durable `copyright_notice_delivery_intents` rows. Claimant addresses are
re-encrypted into an intent-scoped private recipient record, while poster addresses resolve from
the affected member's current verified address only at send time. Every legal email references an
immutable deterministic correspondence body; SES acceptance records its MessageId and sets the
correspondence `sent_at` in the same database transaction as the intent receipt. The five-minute
notification-queue reconciliation re-enqueues pending, failed, and expired claims. Bounce and
complaint feedback transitions only the correlated SES intent to `bounced`.

A statutory counter-notice forwarding intent is created only inside the qualifying deadline
transaction, after an identified reviewer has found the immutable counter-notice compliant. The
forwarded body and restoration date derive from that assessed submission and exact target scope.

The form-intake layer adds a deliberately small authoritative resolver for the currently supported
post-image placement: it accepts a hosted post URL plus image ID, verifies the association in the
primary database, and derives the placement key server-side. It does not accept caller-supplied
placement keys or revisions. The full authoritative revision and delivery transition remain in the
media-placement layer.

Signed-in forms may create a provisional restriction only after the exact current structured
intake is deterministically complete (contact, work, declarations, signature, and hosted target)
and receives a `not_obviously_invalid` anti-spam screen; PostgreSQL binds the assessment and
restriction to that screening record. The screening is not a legal assessment and cannot fill
missing statutory fields. Guest forms and every email intake remain moderator-gated. Email admission uses
the trusted SES `intakeKind`/S3-prefix contract, preserves the exact raw object version before
parsing, retains encrypted threading headers, and retains malformed messages for manual review.
The extraction records all statutory fields plus bounded source excerpts without inventing missing
declarations. Ordinary approval identifies the recommendation reviewed; an agent failure requires
an explicit manual-fallback reason.

After an email intake is admitted, its Message-ID and reply references are correlated with keyed
digests only. A matched inbound reply receives an immutable pending-review record and remains attached
to the original MIME evidence and still receives the advisory extraction/recommendation. Staff must
classify and admit it through the correspondence endpoint; the admission creates the case submission and inbound correspondence without allowing the agent to trigger a
restriction, deadline, or outbound delivery. An accepted statutory counter-notice produces a
case-scoped private forwarding correspondence containing the canonical declarations, consents,
contact details, signature, and exact target IDs and URLs; those private details never enter the
member projection.

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
