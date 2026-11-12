# Copyright Notice Lifecycle

Copyright notices are legal cases, not `MODERATION_POLICY` reports. They may refer to content that
is otherwise allowed by platform policy, and an ordinary moderation appeal does not become a US
statutory counter-notice. The copyright domain therefore owns its records and deadlines while
reusing staff authorization, notifications, modlog, and approved-correspondence patterns.

New claimant intake is disabled by default (`COPYRIGHT_INTAKE_ENABLED`). Disabling intake must never
hide accepted complaints or interrupt an existing case's review, appeal, counter-notice, court or
CCB filing, correction, withdrawal, redress, hold, delivery, enforcement, or restoration
obligations. The runbook owns the activation procedure.

## Ownership boundaries

- `@services/copyright-notices` owns case creation, immutable submissions and evidence metadata,
  compliance assessments, human review, public projection, deadlines, holds, and restoration intents.
- Intake routes and workers authenticate or verify CAPTCHA/attestation, encrypt private fields,
  and call the domain service. No caller updates copyright tables directly.
- The media placement service owns the current placement revision, reversible delivery state, and
  non-copyright blockers such as deletion, replacement, safety action, or court order.
- Staff moderation surfaces own human review, corrections, appeals, correspondence approval, and
  legal escalation.
- A delivery worker can never decide that a counter-notice is compliant or that a hold is
  qualifying.

Email thread assignment uses the references known when an intake is admitted. A later arriving
message may extend or make that graph ambiguous without rewriting an immutable case link. The
retained receipt prevents erased private evidence from being admitted again on replay.
The digest dictionary resolves independently before reference admission. An unsuccessful admission
may leave an unreferenced digest for ordinary token cleanup; that dictionary entry grants no case
link or evidence authority. References are admitted against the live receipt and case retirement
boundary before thread ancestry and case matching are derived from committed references. An interrupted derivation
may leave hash-only references for replay; they do not authorize a case link or private evidence
processing.

## Current screening authority

AI screening of a structured form is advisory unless a current, completed clear result, a compliant
assessment, and complete statutory fields all exist. Starting a new screening immediately blocks new
automated assessments and restriction admission. Advisory guidance is labelled "AI guidance — not a
decision", is never read by a workflow predicate, and never sees claimant contact details or
signature text. Re-screening never lifts an existing takedown.

## Moderator-first launch

Automatic provisional withholding is off until the owner decides otherwise and operators have set
every claimant abuse gate. While off, a clear screen creates no restriction: the intake waits in the
staff queue and a moderator's acceptance records the human assessment. Turning the switch on does
not release a backlog, because automation acts only on submissions received after the audited
change. Claimant misuse (withdrawn, rejected, or reversed notices) is recorded as evidence for DSA
Article 23 and 17 U.S.C. 512(f), but nothing acts on it automatically; a suspension is a moderator
decision. A suspended claimant's still-unreviewed automatic restrictions are reversed.

Staff sees those outcomes as counts within a bounded latest-notice window for one claimant. The
staff-only REST and legal MCP reads use the same claimant-scoped opaque cursor to open the next
window; each window reports its own counts and notice count rather than cumulative totals. This
keeps a claimant's full history inspectable without making each queue page scan that history.
Original receipt times show the span of each count-based window, so staff can distinguish a burst
of notices from activity spread over a longer period. These spans can overlap when a notice is
ingested late; they do not imply fixed calendar periods or cumulative evidence.

## Immutable decision statements

Restrictions record a statement when imposed, when a person first confirms or reverses an
automatic decision, and when the restriction ends. The statement never treats pending edge delivery
as proof that an image is visible. Statements exclude contact details, signatures, private
evidence, and staff rationale. When a notice discloses automated assistance it uses the one shared
sentence from the statement-of-reasons builder. A moderator deleting an automatic decision does not
turn it into a human decision.

## Placement enforcement boundary

Hosted images are addressed by a durable image-placement identity with a monotonic revision.
Action workers re-read and lock the authoritative placement, binding, revision, every legal
blocker, and the restriction state before applying an intent. Withholding one placement never
deletes the source image or blocks another placement that uses it. Legal references retain the
binding but retained identity alone never grants delivery. Application controls alone cannot
revoke a warm CDN response, so complete enforcement also needs the edge registry and cache
invalidation described in
[media-delivery safety](../../overview/architecture/services/README.md);
intake stays off until those controls are verified. Image-similarity candidates are advisory and
never expand a notice or apply a restriction.

### Surface targets and parties

A notice can target a post image, avatar, profile-link image, topic logo or hero, or community
profile or banner image. Who is told, who may respond, and who earns a repeat-infringer incident
depends on who set the image, recorded at activation time so a later role change cannot rewrite it:

| Target                            | Restriction notice and right to respond                 | Informational notice                                                    | Incident after human confirmation         | Retention party |
| --------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------- | --------------- |
| Post image                        | Post author                                             | None                                                                    | Post author                               | Post author     |
| Avatar or profile-link image      | Profile owner, including an administrator               | None                                                                    | Profile owner, including an administrator | Profile owner   |
| Community profile or banner image | Recorded setter, unless a site administrator or unknown | Other live community owners; all live owners when the binder is unknown | Recorded non-administrator setter         | Recorded setter |
| Topic logo or hero                | None                                                    | None                                                                    | None                                      | None            |

An administrator-set community image is provider content, and topic images have no subscriber
counter-notice flow. Deleting or erasing a setter neither restores the image nor cancels a
counter-notice filed first. An administrator may lift a restriction with no live responding account
only with a written rationale.

## State is derived

There is no mutable `status` column. State derives from immutable facts and one-way timestamps, so
parsing or moderation can never rewrite receipt history. Every automatic provisional restriction
must receive its own recorded `confirm` or `reverse` decision from an identified staff user; it
cannot become final because no appeal arrived. Each restriction is independent: reversing one does
not override another copyright case, a safety restriction, deletion, replacement, or a court order.

## US counter-notice timing

A substantially compliant US counter-notice starts its clock at the immutable receipt time of the
submission found compliant, not at parsing, assessment, approval, or forwarding. The schedule uses
the US federal business calendar in `America/New_York`: restoration is earliest at the start of
business day 10 and escalates at business day 14 (17 USC 512(g)). The forwarding correspondence
sends the claimant the canonical counter-notice case-privately. Missing the deadline is an overdue
incident and urgent escalation, not a reason to keep eligible material down. A restore intent is
not delivery authorization: the media worker rechecks every durable blocker.

## Court and CCB holds

A proceeding blocks restoration only when the designated agent received it before restoration and
staff recorded that it came from the notifier or their agent (17 USC 512(g)(2)(C)), was commenced
rather than threatened, identifies the same material, and (for the CCB) is a qualifying claim under
17 USC 1507(d). Until staff assess a filing it blocks every target; afterwards only the targets it
names. A hold resolution is an immutable record, never an edit of the filing. Resolving a hold does
not bypass the counter-notice deadline or the human reversal requirement.

## Jurisdiction and public meaning

US timing does not govern EU or UK cases. The US form and email intake accept `us_dmca`; EU and UK
intake stay unavailable until an operator records a jurisdiction approval, and never before the
staff territorial screen ships. Withdrawing approval stops only new intake; a received notice
remains decidable. EU and UK decisions are human: a statement of reasons or review exists only when
an identified staff user supplies it, with a required public explanation kept separate from the
internal rationale. A member-visible case records an allegation and, where applicable, a
provisional restriction or reviewed outcome. It never describes the claimant as the proven owner or
the poster as an infringer.

EU complaints and out-of-court dispute settlement follow DSA Articles 20 and 21; each party has one
complaint per decision, and the six-month window starts at that party's earliest sent decision
notice. UK has no participant redress route. Transparency reporting and the Article 24(5) statement
database are independently switchable and carry no personal data or statement text.

An EU transparency report is stored once, a full day after its period closes, and never changes.
Facts count by when Voucha recorded them, not by the email arrival date, so a late-admitted fact
cannot be backdated into a published period; it counts in the period it was recorded in.

## Staydown matching

DSM Directive Article 17(4)(b)-(c) obliges only an online content-sharing service provider to keep
confirmed-infringing works down. Whether Voucha is one is a legal question the owner decides, so
the capability ships switched off. It never blocks, hides, or delays an upload, because
Article 17(7) and CJEU C-401/19 forbid preventing lawful uses such as quotation, criticism, review,
caricature, parody, and pastiche, and an image match cannot tell those from infringement. A match
only creates a staff review item. The registry holds only images a moderator confirmed; lifting the
restriction removes the entry. National variants such as the German UrhDaG are out of scope.

## Repeat-infringer incidents

A human `confirm` on a US restriction, or a staff-confirmed EU/UK `restrict`, creates one incident
for the live account in the target's strike set. Every authorized reversal is terminal and
dominates confirmation. A restoration under the counter-notice process is procedural, not a finding
that the restriction was wrong, but it does end the incident. Further operative incidents open a
staff review that never suspends or deletes the account by itself; restricting or terminating
requires an administrator. An operative incident does not block account deletion: incidents stay
linked to the retained account identity as the minimal 17 USC 512(i) record. Account deletion is
refused while an unresolved qualifying court or CCB hold, or an administrator-placed legal-process
preservation hold, applies (see [account deletion](../users/ACCOUNT-DELETION-DATA-REQUEST.md#deletion-refusals)).

## Data export

The account data export (GDPR Art. 15, CCPA right to know) includes the account's copyright records
under a deliberately conservative redaction rule, so the export reveals nothing new. The account's
own filings are exported in full. For a case the account is party to from the other side, the
export uses only the participant projection a non-staff member already sees. It never includes the
other party's legal name, address, email, phone, or signature, nor moderator rationale, internal
notes, agent recommendations, reviewer identities, or raw email. Delivery and outbox rows are
transport, not user records. A case erased by [retention](#evidence-retention) never fails the
export. See [account data export](../users/ACCOUNT-DATA-EXPORT.md#copyright-records).

## Evidence retention

The daily operational cleanup separately expires screening and transport attempts, unused guest
capabilities, and case-exclusive email threading after the case has no open work and its reply
window has passed. Appeal and counter-notice retry keys are stored only as digests; exact
replay remains available while the case exists. Orphan thread digests age before deletion so
concurrent intake can finish reference admission; a disappearing digest results in a conflict.
A per-case intake-age high-water prevents old
SES replays from rebuilding expired references while fresh email can still thread through an eligible case. An unlinked email
intake loses its original object and private MIME parse and attachment data after inactivity; a
minimal SES receipt remains to prevent re-admission on replay. Erasure intent is committed before
the first object-version delete, and the receipt blocks new processing while bounded cleanup
continues. Unlinked erasure and source admission use serializable boundaries around their receipt
decisions; a conflicted cleanup page leaves its cursor unchanged for the next scheduled run.
Case-linked ancestry can retain a receipt endpoint without keeping the unlinked private
intake. A standalone unlinked email receipt keeps its final review decision, reviewer, time, and
encrypted explanation for six years from the latest receipt, review, delivery, or preservation
release activity. An active legal preservation hold, a linked case, live private intake, or pending
delivery blocks that erasure. The receipt then keeps only its SES identity and original replay checks.
Any dependent attempted-rationale legal record retires first so its review context remains intact.
Staff may place a hold while the standalone final review still exists, even after the private
intake is erased. A hold is its own row; releasing it takes the hold id returned on placement, so a
stale release cannot clear a later hold. Release restarts the legal-record window.
Final case and redress outcomes remain on their owners while those owners exist. The six-year policy includes EU and UK lifecycle and staff-review history and
records advisor review with owner approval.
Detailed lifecycle, assessment, recommendation, and review history expires through guarded monthly partition
retirement after the owner-approved six-year window. Recommendation history also expires when
its private intake was erased earlier; retained review provenance cannot keep the full agent
output indefinitely. Retained identities preserve protocol
references without authorizing deleted records. Form intakes are created with a required notice
foreign key, so there is no unlinked form-intake state to sweep.

GDPR and UK GDPR need real deletion or anonymisation when the legal period ends. The US side must
keep records while repeat-infringer review, restoration, limitation, or litigation work remains.
The approved case clock retains each jurisdiction for six calendar years after its latest legal
activity, including the final decision's complaint window. A new legal fact or hold release advances
that clock. Detailed history has its own guarded partition retirement until the case is purged.

Case SQL pointer cuts, child deletion and final removal share a serializable preservation boundary.
Account and case hold placement read the affected legal-record families through their case foreign
keys, including current pointer values. A conflicting destructive page rolls back without advancing
its cursor; the next scheduled page sees the committed hold. The page does not retry within its run.

Case evidence deletion checks current preservation again on the primary immediately before each
physical S3 deletion batch, after listing its versions. Completion is checked again before clearing
evidence pointers, including when no versions remain. A hold visible at either admission stops the
page and retains its evidence pointer. A hold committed afterward protects later pages; it does
not cancel the already-admitted external request. A database rollback cannot restore object
versions that S3 has already deleted.

Operational thread retirement admits only records without a current account or case preservation
hold. Hold placement inventories the records it protects in the same serializable transaction;
retirement reads those holds before deleting the records. A serialization conflict rolls back the
losing operation: staff receive a conflict response, and a sweep stops until its next scheduled
run. Neither operation retries within that run. Releasing a hold permits operational thread
cleanup; the separate case and standalone legal-record clocks still advance on release.

Writers that can introduce retention blockers read the case's existing thread-retirement state
in the same serializable transaction. Adding or relinking thread references, ancestry or reply
links to a retired graph returns a conflict and rolls back those additions in their owning transaction.
Reference admission and graph derivation commit separately; a later conflict does not undo already
admitted reference facts. Pure duplicate graph replays remain no-ops. This does not
bar legal decisions or account erasure: final account deletion still clears a form requester while
retaining the case and its identities. PostgreSQL may also reject transactions on different cases
because its physical predicate locks can cover more than one case; the same conflict boundary
applies, without an internal retry.

Proof invalidation protects against obligations introduced behind a bounded cursor. It does not
serve as a transaction mutex: renewing a worker lease or removing a blocker need not invalidate a
negative proof. Case activity and its referenced legal source commit atomically; checking that
reference at commit lets their substantive writes follow the same dependency direction as delivery
work without adding a parent fence.

- Staff may preserve a case for overlapping written litigation threats or court and regulator
  requests, including after evidence deletion has started. Each page checks the current hold and
  account state before removing anything else.
- A party account's hold release and final deletion extend the case clock even after the account's
  shorter audit history has expired. The retained account identity carries these dates without
  granting access to the deleted account.
- Open queue work, a deadline, active restriction, operative incident, pending delivery, live guest
  capability, unresolved complaint or dispute, pending thread-linked reply, or preservation hold
  prevents case purge. Frozen statutory reports keep their published nonpersonal figures.
- The case job removes every version and delete marker of exclusive evidence objects before it
  deletes case rows. It keeps the initial replay anchors until the atomic case deletion, so an
  identical application request still replays its original result while the case exists and can
  start a new case after purge. A minimal SES provider receipt survives independently for delivery
  replay.
- Each job run reads and deletes a bounded page. A failed or interrupted page is retried from its
  stable job identity; a new hold or legal fact restarts verification. The existing operator switch
  can pause the purge during an incident. See the [runbook](../../runbooks/copyright-notices.md#copyright-case-purge).

## Activation gates

Before accepting live notices the operator must register and publish the actual US designated
agent, appoint any required EU/UK representatives, approve retention and repeat-infringer policies,
staff the response targets, and provision a versioned encrypted evidence bucket with least-privilege
mail and worker access. Placeholder addresses, credentials, or registration claims are forbidden.
Do not claim a designated agent is active before it is. See the
[copyright operations runbook](../../runbooks/copyright-notices.md).
