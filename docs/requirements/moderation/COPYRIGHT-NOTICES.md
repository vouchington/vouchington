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

The [owner-approved lifecycle](https://github.com/vouchington/vouchington/issues/3642#issuecomment-6402857533)
keeps US, EU, and UK case evidence, personal data, all territorial/DSA case rows, the minimal legal
record, and local transparency-database submission copies for six years after the latest substantive
activity. Evidence erasure and minimal-record deletion use that same clock. Technical erasure,
report compilation, cursor updates, and replay reads do not start another case-retention period.

The clock includes the final decision and complaint window, redress and out-of-court outcomes,
escalation closure, content restoration, incident cessation, account purge, released holds, and the
last transparency-database submission. Open review, restrictions, complaint windows, redress,
out-of-court disputes, escalations, supervisory complaints, regulator/court requests, litigation
threats, operative incidents, actual suspension reliance, and ungenerated period aggregates block
erasure. A living account alone is not a blocker. Account suspension provenance identifies the
specific case evidence still required; formal reinstatement does not release it before actual
unsuspension or account purge.

Completed account-level staff reviews and reinstatements are detailed history. Their monthly
partitions expire after six years, with scoped preservation holds. A later independent review or
incident does not extend an earlier history event. The account owner retains pending work and its
current final result, explanation, retained decider, and decision time. Effective termination
facts survive later independent reviews until explicit reinstatement. Current suspension authority
and its incident provenance continue to block unauthorized unsuspension and case erasure after
historical review deletion.

Erasure commits an admission fence, then advances bounded provider and database pages. New case
work fails closed after admission. Every page rechecks the legal proof before irreversible work;
a newly placed account hold stops remaining work, but cannot restore earlier eligible deletions.
Application ciphertext uses separate keys for case evidence, private intake data, and retained
receipt explanations. Key ownership follows each record's retention lifetime, so retaining a final
explanation cannot prolong access to an expired private intake. Authoritative wrapped copies live
only in private object storage. Confirmed all-version deletion destroys the live key authority;
a database restore recovers only handles and missing keys fail closed. This does not claim deletion
of provider keys, memory copies, or every backup. Shared raw email objects retain their existing
physical-erasure policy: every version is deleted only when no other valid intake/artifact owner
requires the bytes. Case-owned copies are re-encrypted under the case key.

Raw submission keys keep their existing short window. Retained replay identities use a dedicated,
separately held HMAC key, no case backlink, and an outcome code. Their period is ten years after the
later of case purge or last replay, with annual review. These are keyed identifiers, not anonymous
records, and they never authorize the deleted case. Live-case exact replay and external authorization
remain required. Aggregate EU transparency reports and their nonpersonal method snapshots are
retained indefinitely. Required report coverage also protects monthly report-source retirement.
Exact-period cumulative snapshots preserve counts after case deletion. Compilation refuses periods
it can no longer safely reconstruct from their existing snapshot and remaining sources; stored
snapshots remain available.
The extended CSV remains an export of the live retained population.

Legal-record tables refuse changes outside scoped erasure and eligible purge paths. New ciphertext,
storage references, or lookup tokens must be classified in the owning erasure contract. See the
[runbook](../../runbooks/copyright-notices.md#evidence-retention-deletion) for operational prerequisites.
The daily operational cleanup separately expires screening and transport attempts, unused guest
capabilities, and case-exclusive email threading after the case has no open work and its reply
window has passed. A per-case intake-age high-water prevents old SES replays from rebuilding
expired references while fresh email can still thread through an eligible case. An unlinked email
intake loses its original object and private MIME parse and attachment data after its separate
90-day inactivity window, subject to preservation. A minimal SES receipt remains to prevent
re-admission on replay. Erasure intent is committed before
the first object-version delete, and the receipt blocks new processing while bounded cleanup
continues. Case-linked ancestry can retain a receipt endpoint without keeping the unlinked private
intake. Final legal and staff outcomes live on their owning case or redress request for
that owner's lifetime. A standalone unlinked receipt's final review decision, reviewer, review time,
explanation, and independent key expire together on the six-year copyright clock with preservation
and delivery blockers. Receipt-scoped preservation remains actionable after the private intake is
gone; release advances the applicable retention clock. Only the minimal SES replay identity remains
after retirement, preserving exact replay without retaining final staff facts.
The six-year policy includes EU and UK lifecycle and staff-review history and records advisor
review with owner approval.
Detailed lifecycle, assessment, recommendation, and review history expires through guarded monthly partition
retirement after the owner-approved six-year window. Recommendation history also expires when
its private intake was erased earlier; retained review provenance cannot keep the full agent
output indefinitely. Retained identities preserve protocol
references without authorizing deleted records. Form intakes are created with a required notice
foreign key, so there is no unlinked form-intake state to sweep.

## Activation gates

Before accepting live notices the operator must register and publish the actual US designated
agent, appoint any required EU/UK representatives, approve retention and repeat-infringer policies,
staff the response targets, and provision a versioned encrypted evidence bucket with least-privilege
mail and worker access. Placeholder addresses, credentials, or registration claims are forbidden.
Do not claim a designated agent is active before it is. See the
[copyright operations runbook](../../runbooks/copyright-notices.md).
