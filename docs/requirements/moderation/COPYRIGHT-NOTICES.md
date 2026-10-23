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

GDPR and UK GDPR need a retention period and real deletion or anonymisation when it ends. The US
side must keep records for the repeat-infringer policy (17 USC 512(i)), restoration (512(g)), the
three-year limitation period (17 USC 507(b)), and litigation holds. A sweep reconciles the two. It
uses the owner-approved three-year period.

- US, EU, and UK cases use the same closed-case retention period.
- A case is never swept while any blocker exists: open queue work, an open deadline, an active
  restriction, an operative incident, a pending delivery, a live guest capability, an unresolved
  hold, a pending thread-linked email reply, or a preservation hold on a party account. Resolving
  the reply restarts the retention period from its receipt or review.
- Personal data and statements are overwritten and evidence object versions are deleted. The
  minimal record survives while a repeat-infringer incident counts. Final deletion waits three
  calendar years after the latest case activity, incident cessation, account purge, or released
  preservation hold, and still requires all live legal work to end.
- Erasure fails closed: the database is overwritten only after every object version is confirmed
  gone, and any failure rolls the case back for the next run. Agent results completed after erasure
  cannot recreate case evidence.
- Legal-record tables refuse changes outside the scoped evidence erasure, raw-key retention, and
  eligible case-purge paths. A new copyright column holding ciphertext, a storage key, or a lookup
  token must be added to the erasure list or recorded as kept; a test fails until it is.

Authenticated submission requests clear the key from the raw legal row after 30 days. A compact
requester fingerprint, key, request fingerprint, and public receipt snapshot survives for exact
replay. Retained receipt identities do not authorize a deleted case or a new action.

Final deletion drains case-owned rows in bounded pages and resumes from a durable checkpoint. Each
page rechecks legal holds and eligibility before it deletes data. A newly placed hold stops remaining
pages; data already erased under the prior eligible decision cannot be restored. Cases with DSA
statement submissions remain preserved until their separate legal-record lifecycle is approved.

Operating it needs evidence-bucket delete permission and a check that the account data export of an
erased case completes. See the
[runbook](../../runbooks/copyright-notices.md#evidence-retention-deletion).

## Activation gates

Before accepting live notices the operator must register and publish the actual US designated
agent, appoint any required EU/UK representatives, approve retention and repeat-infringer policies,
staff the response targets, and provision a versioned encrypted evidence bucket with least-privilege
mail and worker access. Placeholder addresses, credentials, or registration claims are forbidden.
Do not claim a designated agent is active before it is. See the
[copyright operations runbook](../../runbooks/copyright-notices.md).
