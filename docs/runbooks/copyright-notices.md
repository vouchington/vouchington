# Copyright Notice Operations

The [current screening authority contract](../requirements/moderation/COPYRIGHT-NOTICES.md#current-screening-authority)
governs re-screening recovery. The existing agent-dispatch sweep wakes unclaimed pending, failed,
and expired claims; while [automatic provisional withholding](#automatic-provisional-withholding)
is on, completed current clear results repair their exact workflow effect without another provider
run. Pending/failed cases remain staff-actionable. Staff approval records human
authority atomically with the intake review. Existing restrictions and their delivery workers
continue while screening runs.

This runbook covers recovery and escalation for the durable lifecycle in
[Copyright Notice Lifecycle](../requirements/moderation/COPYRIGHT-NOTICES.md). It does not replace
qualified legal review. Production contacts, credentials, response rosters, and infrastructure
identifiers belong in the private operations repository.

## Service targets

- Triage every automatically restricted case within four elapsed hours.
- Complete ordinary human review within 24 elapsed hours.
- Apply an operator- and counsel-approved response target to guest, email, EU, and UK queues.
- Escalate an unresolved US restoration at the start of business day 14; treat the exclusive end of
  day 14 as an overdue incident.

These are product response targets, not representations of safe-harbor eligibility.

## Trusted flaggers

The trusted-flagger registry is staff API tooling with no web screen. Staff copy designations by
hand from the Commission's published list; there is no automatic import. An administrator creates
an entry with `POST /api/v1/copyright-trusted-flaggers`, recording the entity name, linked Voucha
account, awarding Digital Services Coordinator, two-letter uppercase member state, award date,
optional award reference, and designation's area wording. Record `intellectual_property` only for
an intellectual-property designation; otherwise record `other`.

Reviewers read the bounded registry with `GET /api/v1/copyright-trusted-flaggers` and an entry with
`GET /api/v1/copyright-trusted-flaggers/:id`. Administrators append suspension, reinstatement, or
revocation with `POST /api/v1/copyright-trusted-flaggers/:id/status-changes`, providing a reason
from the designation record. Revocation is final. Correct a wrong entry by revoking it and creating
a replacement; entries have no PATCH or DELETE route.

A signed-in EU notice captures an eligible account match in its receipt transaction, even while
`copyright.trustedFlaggerPriority` is off. Guest and UK notices never match. Entries added after
receipt do not change earlier notices. Only intellectual-property matches receive copyright
priority or count as trusted-flagger notices in reporting and statement submission; an `other`
match remains recorded without those effects. Every matched notice still requires human review.

`copyright.trustedFlaggerPriority` defaults to `false`. Registry routes remain available with
that switch or intake off, so staff can prepare records without enabling priority. Priority also
requires an unwithdrawn `eu_dsa` approval; follow the [intake activation gate](#intake-activation).
This runbook does not authorize enabling the switch or approving a jurisdiction.

## Queue triage

The staff case queue (Moderation sidebar, Copyright, Case Queue) lists missed restoration deadlines
first, then deadlines past escalation or unassessed court or CCB filings, then other open work, each oldest wait first. Work it top
down. Each case shows why it is queued and how long its oldest open item has waited. The email
intake queue shows each message's wait age. With `copyright.trustedFlaggerPriority` enabled and
an unwithdrawn EU jurisdiction approval, an EU notice with an in-area trusted-flagger match sorts
first within its urgency tier, then by oldest wait. It never moves ahead of a more urgent case.
With the switch off or approval withdrawn, queue order is unchanged.

1. Confirm the original submission and evidence digest exist. Never reconstruct a missing email from
   agent output.
2. For email, compare the structured extraction with the inert original and correct it before
   accepting the case. Verify each extracted declaration against its recorded source excerpt. If no
   recommendation exists, use the explicit manual-fallback reason; never silently bypass the agent.
3. Confirm the target is an exact Voucha-hosted placement and preserve its captured revision. Staff
   approval resolves any existing placement, whatever its audience (signed-in-only, followers-only,
   private-community, draft, or archived). A claimant form reaches you only with targets that claimant
   could open directly at submission; any other target was refused with the same 422 as a missing one
   and nothing was recorded, so a rightsholder who cannot see the material needs the email path.
   The same selection can name an avatar, profile-link image, topic logo or hero, or community
   profile or banner. Verify the displayed surface and immutable setter/uploader provenance. A
   topic image is assessed and withheld normally, with no subscriber counter-notice or incident;
   the claimant receives the decision. For an administrator-set community image, no setter
   receives a subscriber notice or incident, while other live owners receive information only.
   See [target parties](../requirements/moderation/COPYRIGHT-NOTICES.md#surface-targets-and-parties).
4. Record missing elements as an assessment and request information. Do not silently reject a
   substantially compliant notice for failing to match Voucha's form wording. For a form-filed
   case, send the request from the case's Guest access section (issue access, then Request
   information). It is emailed to the claimant address on the notice, with no need to contact the
   claimant another way. Its state (Queued, Sent, Failed, or Bounced) shows under Information
   request delivery. Retry a failed one under Delivery failures, and verify the address after a
   bounce. A case with no retained claimant email refuses the request with 422.
5. To reject an email or ask the sender for more information, check who will receive the reply. An
   email with a parsed sender replies to that sender. An email with no parsed sender (a `failed`
   or `unparsed` parse) has nobody to reply to, so the reply field appears and a decision queues no
   reply unless you type an address there. Type one only when the original MIME shows a sender
   worth answering; the server refuses an address for an email that has a parsed sender. The
   staff page then reports "A reply was queued." or "No reply sent."; the API returns
   `reply_queued`. If the queued reply later fails or bounces, the intake returns to the email-review
   queue with a `reply_failed` or `reply_bounced` reason and the time since the failure.
   - **Retry reply** appears only beside a `reply_failed` item. After you confirm, the same stored
     reply is sent again to the same sender, word for word; the retry is recorded under your name
     as a `delivery_intent_replayed` audit event that belongs to the reply, not to a case. The retry
     applies only while the reply is failed, so a second click, or a retry by another reviewer at the
     same moment, finds nothing failed and reports that the reply was no longer waiting. If the
     retried reply fails again, the item returns to the queue and can be retried again. A
     `reply_bounced` item has no retry, because a bounce means the address does not accept mail, so
     contact the sender by another channel.
   - **Reject email intake** closes the intake without opening a case. It needs the review
     rationale, plus the manual-fallback reason when there is no recommendation.
   - **Request information** closes the intake the same way and sends your message to the sender.
     It also needs the rationale, and it stays disabled until the message is not blank and is at
     most 10,000 characters; the count beside the field shows how close you are. The message follows
     the fixed reply text, so write only what the sender must supply, such as the work and each
     allegedly infringing URL.

   Arrival receipts and staff replies are separate obligations. A receipt failure never raises
   `reply_failed`; Retry reply resets only the stored rejection or information-request reply. A parse
   that lands after the decision sends no staff reply, and a repeated decision reports the original
   outcome.

6. While automatic provisional withholding is off, or a notice fails an abuse gate, a
   clear-screened signed-in form waits here like a guest form. Accept it to withhold its targets, or reject it. The screen is advisory only.
7. If a signed-in case was provisionally restricted automatically, record a human `confirm`,
   `modify`, or `reverse` decision even when nobody appeals.

### Email authentication and malware verdicts

The email review page lists the SPF, DKIM, DMARC, spam, and malware verdicts Amazon SES recorded
when it received the message, each shown as Pass, Fail, Inconclusive, Check failed, or Not reported.

- An SPF, DKIM, or DMARC failure, or a spam verdict, adds an Authentication risk note. It is context,
  not a decision: a real claimant can fail these through a forwarder or mailing list, so weigh the
  note with the rest of the evidence and decide the intake as usual. Do not reject a notice for it
  alone. DKIM Pass means a signature validated, not that the signing domain matches the From address.
- Not reported means SES did not state a verdict, so treat it as unverified, never as Pass.

### Quarantined originals

When SES reports malware in an email (Malware: Fail) the page shows "Original email withheld" in
place of the download link, and the raw `.eml` route answers `409 COPYRIGHT_EMAIL_QUARANTINED`. Review
the parsed text and decide the intake normally; do not look for another way to open the original.
Report a suspected false positive to engineering rather than working around it.

When the malware verdict is Inconclusive, Check failed, or Not reported, the download stays
available and the page warns you. Download it only if the parsed text is not enough, and open it in
an isolated environment. Those verdicts do not block the download because a sender can force Check
failed with a malformed message, and blocking would keep a valid notice from review.

## Intake activation

Keep `COPYRIGHT_INTAKE_ENABLED=false` until all of the following are verified in the target
environment:

- the published address belongs to the registered US designated agent and production inbox routing
  assigns `copyright` only to the trusted `copyright-incoming/` S3 prefix;
- `S3_BUCKET_COPYRIGHT_EVIDENCE` is private, encrypted, versioned, access-logged, retention-reviewed,
  and writable/readable only by the required workers and authorized evidence tooling;
- form Turnstile secrets, route rate limits, scheduled agent reconciliation, and moderator queues
  are live, queue urgency orders the staff queue, and the [review-target page](#review-target-page)
  warns on late work (its Sentry alert rule is not set up yet);
- reversible placement withholding and origin/CDN denial have passed end-to-end testing;
- receipts, poster notices, approved correspondence, retry/bounce handling, appeal and counter-notice
  workflows are live; and
- the repeat-infringer policy, retention schedule, templates, staffing, and legal review are approved.

Never approve `eu_dsa` or `uk` before the staff territorial screen (#1906) has shipped. Approval is
administrator-only: `POST /api/v1/copyright-jurisdiction-policies`. This prerequisite is separate
from `COPYRIGHT_INTAKE_ENABLED`; neither is authorization to enable the other.

This switch is the intake kill switch. It stops only new claimant intake: the notice forms, staff
approval of an emailed notice (which would open a new case), the AI email-intake recommendation
job, and the AI form-screening job. Existing complaint pages, all ongoing statutory casework, and
designated-agent email ingest remain available; use the individual delivery/enforcement controls
and incident procedures rather than the intake switch to manage a downstream outage.

| Class             | Routes                                                                                                                                                                                            | While the switch is off |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| New intake        | `POST /api/v1/copyright-notices` (signed-in and guest form), `POST /api/v1/copyright-eu-notices`, `POST /api/v1/copyright-uk-notices`, `POST /api/v1/copyright-email-intakes/:id/approvals`       | 503                     |
| In-case responses | Appeals, counter-notices, guest filings (supplement, withdrawal, court/CCB hold), EU and UK redress, EU supervised complaints                                                                     | Open                    |
| Staff             | Every other staff decision, review, replay, capability, repeat-infringer, jurisdiction-policy, trusted-flagger registry, and report route, including recording or rejecting a matched email reply | Open                    |

[`intake-kill-switch-routes.test.mts`](../../backend/api/v1/copyright-notices/intake-kill-switch-routes.test.mts)
fails when a non-GET copyright route has no class. Approving an emailed notice creates a new case,
so it is closed with the forms. Staff approval of an already received form intake is a staff
decision, so it can still open a case while the switch is off. New EU and UK notices need the
switch and an unwithdrawn jurisdiction policy approval. Turning the switch on does not approve
either jurisdiction. Approval controls new EU/UK receipts only. Withdrawal does not stop staff from
acknowledging or deciding a received notice, delivering its notices, processing redress, or
restoring a decision-authorized restriction; those operations use the approval snapshot on the
receipt. Do not route an existing case through new-intake approval.

The web staff queue uses `territorial_notice_review` for a received notice without a live decision
and `territorial_decision_reopened` after a complaint `revoke` of `no_action`. Reviewers resolve the
notifier's URL to post-image targets. `restrict` requires one or more such targets and the normal
human-compliant assessment; `no_action` has no targets or withholding. A reopened notice may receive
a restricting successor only. The public explanation is sent to the poster and notifier, so keep
personal data out of it; internal rationale remains separate.

### EU complaints and Art. 21 recording

The anonymous jurisdiction-availability read controls the EU filing link and form only. Guests
file with a name, receipt email address, exact location, contact, grounds, and good-faith statement.
Receipt and decision notices go to that retained address; account notifiers also receive in-app
notices. Existing case pages and complaint forms remain available after approval is withdrawn.
Keep both jurisdiction approvals unapproved until the activation prerequisites are met.

Review `territorial_redress_review` for a complaint awaiting a decision on the live territorial
decision. Use the staff case's per-recipient informed time and complaint window, not intake time or
a case-wide clock. Only sent decision notices count; a bounced message does not. A never-informed
party and a reviewer have no cutoff. Notifier and poster each have their own complaint per decision;
an old request cannot reverse a superseding decision. Staff write the complaint rationale for the
complainant, who receives the reasoned decision and redress options. A revoked `no_action` returns
to `territorial_decision_reopened` until staff record its restricting successor.

For an EU guest notifier, locate the matched reply to the decision email and explicitly admit it
as `complaint`. Verify the guest receipt and live decision. The service measures the window at the
reply's `received_at`; admission delay does not close it. Mail alone authorizes no change, a
rejected reply creates no complaint, and an account notifier uses the case page instead.

Record an Art. 21 referral using the dispute-settlement routes in the
[API contract](../requirements/api/v1/copyright-notices/README.md#eu-filing-complaints-and-dispute-settlement).
Check the body name, referral time and named party against the received case. Record one outcome;
a recipient-favouring outcome permits one implementation time at or after its decision. Perform
the staff case action first, then record implementation: the referral or outcome itself does not
restore media. These records remain usable after withdrawal. UK has no EU filing/complaint UI or
Art. 21 recording.

Never approve `uk` without counsel's written sign-off. Keep both EU/UK approvals unapproved until
the staff territorial screen ships. Approval and withdrawal are administrator-only:
`POST /api/v1/copyright-jurisdiction-policies` and `.../:id/withdrawals`. Basis recorded by the owner
on 2026-09-28: Online Safety Act 2023 s.59 excludes intellectual property, and e-Commerce Regulations
2002 reg. 19 is met by the global pipeline. Counsel has not yet confirmed this basis; it is tracked
in [#1230](https://github.com/vouchington/vouchington/issues/1230).

Designated-agent email is still ingested while the switch is off, so no inbound message waits
unseen in `copyright-incoming/`. The SES worker and its reconcile sweep copy each message into the
evidence bucket, parse it, link a reply to its
existing case, and list it in the staff email intake queue and the
[review-target page](#review-target-page). Both `S3_BUCKET_SES_INBOUND` and `S3_BUCKET_COPYRIGHT_EVIDENCE` must be
configured wherever mail is received, because ingest fails without them. A stack with no
`S3_BUCKET_SES_INBOUND` (local development) skips the five-minute reconcile instead, with a
`scheduled_job_config_missing` warning in Sentry, so in a deployed environment that warning means the
bucket is misconfigured. The AI recommendation job and automatic arrival receipt are paused, so no email contents reach a model
and ingest sends no acknowledgement. When enabled, a successful new-message parse with stored DMARC
pass and no spam or virus failure queues a receipt to the parsed sender. Reply messages do not receive
an arrival receipt. During a pause a sender receives mail only when staff act: the response staff choose when
they reject an email or ask for more information (sent to the parsed sender, or to an address staff
type when no sender was parsed), and the deterministic notices a case's normal
review queues after staff record an in-case filing, such as the counter-notice status update. No
approval receipt goes out, because approving an emailed notice is closed.

When the switch is turned on, the agent-dispatch reconciler sends every ingested email that has no
recommendation and no staff decision to the recommendation job, so emails received during the
pause get their recommendation on the next sweep. An email staff already decided during the pause
is not sent to the model.

### What the agent-dispatch reconciler does while the switch is off

The five-minute `reconcile-copyright-agent-dispatches` sweep keeps running with the switch off. It
holds back only the dispatches that start work for new intake, and it keeps the ones that belong to
a case already open:

- Email-intake recommendation (`email`) waits. A new emailed notice has not been decided, so its
  contents must not reach a model.
- Form screening (`form-screening`) waits. The sweep does not start or retry a screening for a form
  that was received but not yet screened, and a screening job already on the queue, or a retry of
  one, returns without a model call.
- Appeal recommendation (`appeal`) runs. An appeal answers a restriction on an open case and stays
  open, so the advisory recommendation for staff keeps going.
- Submission guidance (`submission-guidance`) runs for filed counter-notices and court/CCB filings
  on open cases. It is advisory processing of an existing case, so it remains eligible while intake
  is off; a missing result is recovered by the next sweep.
- Saved form screening applied (`form-effect`) runs. The form was received and screened before the
  pause, applying it calls no model, and the effect has its own switch.

A held-back dispatch is not lost. It stays pending, and the first sweep after the switch is on
sends it. The email-intake and form-screening jobs check the switch themselves, so one already on
the queue when the switch went off, or a retry of one, does nothing. The `form-effect` step applies
only a saved clear screen of an already received form, and only while
`automaticProvisionalWithholding` is on. To stop automated withholding during an
incident, turn that dynamic-config switch off (see
[Automatic provisional withholding](#automatic-provisional-withholding)); the intake switch does
not stop it.

### Recording an emailed filing while intake is off

Emailed counter-notices and court/CCB filing notices start their §512(g) clocks on receipt, and
their received time is the receipt time kept on the intake. A reply to a message Voucha sent
is matched to its case automatically. Record it from the queue instead of waiting for the switch:

1. Open the message in the staff email intake queue. Read the inert original and confirm it is a
   filing for the case its reply thread matched before recording anything.
2. Record it with `POST /api/v1/copyright-email-intakes/:id/correspondence`: the `kind`
   (`supplement`, `appeal`, `counter_notice`, `withdrawal`, or `court_or_ccb_hold`), the exact
   `target_ids` for an appeal or counter-notice, the structured fields verified against the
   original, and a rationale. No recommendation exists while the job is paused, so send a
   `manual_fallback_reason` (`recommendation_id` is the alternative once one exists).
3. To decline an unrelated or incomplete reply, use `POST .../correspondence-rejections` with the
   same fallback reason.
4. Recording sends the sender nothing. The staff review of the recorded submission, such as the
   counter-notice review, queues the deterministic notices as usual.

An email that did not match a case is a new notice. Staff can read it and reject it, which sends
the response they choose to the parsed sender (see [Queue triage](#queue-triage) for an email with
no parsed sender), but `POST .../approvals` returns 503 until the switch is on. If it also
carries a statutory filing for an existing case, handle it from the designated-agent inbox, which
remains the source of truth for §512(g) clocks until the switch is on.

The web footer must link to the Copyright policy, designated-agent status, repeat-infringer policy,
Terms, Privacy, and Community Guidelines. Before launch, counsel must update the DB-backed Terms,
Privacy, and Community Guidelines articles to describe the activated process, case-record privacy,
evidence retention, and repeat-infringer enforcement. The placeholder-free public designated-agent
page must state that the channel is inactive until a real registration and monitored contact exist.

Do not advertise EU or UK statutory intake until counsel completes representative appointment and
the applicability review. Those contracts stay unavailable until an unwithdrawn jurisdiction policy
approval is recorded. The public form still accepts only `us_dmca`.

The application repository creates placement-bound URLs and durable PostgreSQL action intents, but
that is not complete CDN enforcement. Activation also requires the linked infrastructure change to
authorize every placement request at the viewer edge, deny direct origin access, retire historical
generic post-image routes, publish the authoritative delivery registry, and invalidate cached
placement paths after a state transition. Record cold and warm cache evidence for withhold and
restore before enabling intake.

## Automatic provisional withholding

Launch is moderator-first. `automaticProvisionalWithholding` in the `copyright` dynamic-config
namespace stays `false`. Only a developer or an administrator can change it, and the namespace
history records each change.

Before enabling it, confirm all of the following:

- the GDPR Article 22 automated-decision disclosure
  ([#1230](https://github.com/vouchington/vouchington/issues/1230)) is published;
- every abuse gate is set in the `copyright` namespace, **before** you flip the switch:
  `automaticWithholdingMinTrustTier`, `automaticWithholdingMinAccountAgeDays`,
  `automaticWithholdingClaimantDailyCap` and `automaticWithholdingPosterDailyCap`. They launch
  unset (-1). While any is unset, nothing is withheld automatically and every notice waits for a
  moderator, so an incomplete setup fails closed. There are no defaults to inherit; choose each
  value with legal and trust review. Zero is a real value (a cap of 0 refuses every notice); and
- you flip the switch with the namespace PATCH, not by editing stored state, because the audited
  off-to-on change is what opens the automation window (below).

Enabling it does not release a backlog. Automation acts only on notices received after the audited
off-to-on change. A clear-screened signed-in notice received earlier, and an automated assessment
left pending while the switch was off, stay in the staff queue (`enforcement_pending`) until a
moderator accepts or rejects the intake. Clear the queue by hand. Each automatic restriction then
needs its own human decision within the triage target above.

A notice that fails a gate (suspended or too-new claimant, low trust tier, claimant or poster over
its 24-hour cap, or any non-post target) is never dropped: it waits in the staff queue like a guest form, and a moderator
accepts or rejects it. It is not retried when the cap clears.

The staff case shows the claimant's misuse ledger: notices withdrawn, rejected on review, and
restrictions reversed by counter-notice or appeal. It is recorded whether the switch is on or off.
Use it when deciding whether to suspend a notifier from the user admin panel. Nothing suspends a
notifier automatically. Suspending one reverses their unreviewed automatic restrictions within a
sweep (about five minutes), whatever the switch says; confirmed restrictions stay.

Disabling it stops new automated assessments. Pending automated requests stay unenforced and in the
staff queue until a moderator decides the intake. Existing restrictions stay in place; review them
as usual.

## Staydown matching

`staydownMatching` in the `copyright` dynamic-config namespace stays `false`. Only a developer or an
administrator can change it, and the namespace history records each change. Staydown binds only an
online content-sharing service provider under DSM Directive Article 17(4)(b)-(c). **Counsel must
decide whether Voucha is one before anyone enables the switch.** See
[Staydown matching](../requirements/moderation/COPYRIGHT-NOTICES.md#staydown-matching) for the
contract.

While it is off, nothing is hashed or matched and no review item appears. While it is on, a
moderator-confirmed image enters a registry (exact SHA-256 at once, a perceptual hash a moment
later), and an upload with identical bytes or a near-duplicate image creates a "Possible re-upload"
item in the case queue. The upload still publishes; this feature never blocks, hides, or delays one.

To triage a possible re-upload:

1. Open the case and compare the uploaded image with the confirmed one. A near-duplicate can be a
   lawful use such as quotation, criticism, review, parody, or pastiche; Article 17(7) forbids
   treating a match as a finding.
2. If the upload infringes, handle it through the normal notice workflow. If not, do nothing more.
3. Select **Mark reviewed** so the item leaves the queue. A reviewed match is not reopened for the
   same image and uploader.

Notes for operators:

- Uploads made while the switch was off are not matched afterwards, and turning the switch off
  leaves existing entries inert until their restriction is lifted. Lifting a restriction, including
  a staff reversal, removes its entry and matches.
- A near-duplicate that uploads before the confirmed image's perceptual hash exists is matched
  perceptually only when its `staydown-hash` job is replayed. The entity-listener reconciliation
  replays recent images on its hourly pass, so only a recent upload recovers that way. Identical
  files match at once.
- A stale item that nobody marks reviewed keeps the case in the queue and counts toward the review
  target.

## Counter-notice and hold handling

1. Keep informal appeals separate from statutory counter-notices.
2. Assess the counter-notice without editing its receipt. A compliant assessment creates one durable
   deadline from the referenced submission's receipt time.
3. Promptly forward the complete counter-notice to the original claimant using the deterministic
   statutory template and persist the delivery intent.
4. Review all case correspondence before restoration and record the exact targets each filing
   covers. Restoration of the whole case stays refused while any admitted court or CCB filing has
   no assessment. Assess the filing by the earliest open counter-notice deadline's `escalation_at`
   (start of business day 14), leaving day 14 to restore if it is rejected. Without an open deadline,
   the urgent filing remains subject to `reviewTargetMinutes`. Compare the email sender or guest
   capability holder with the original notice: a qualifying filing must come from the person who
   submitted the notification, or their authorised agent. A not-qualifying assessment releases
   restoration. A threat, unrelated filing, different claimant, different material, non-commenced
   matter, or CCB filing outside the qualifying claim and counterclaim categories is not a hold.
5. Resolve a hold only with an immutable resolution record and staff rationale.
6. Read the submission-guidance panel as advisory evidence alongside the filed counter-notice or
   court/CCB submission. It neither supplies the assessment nor decides qualification, and it never
   changes a deadline, restriction, restoration, or hold. Contact redaction removes email addresses
   and phone numbers from free-text filings before sanitization and hashing; erased bodies are not
   dispatched. Preserve human review and the recorded filing receipt as the source of statutory
   timing.

## Repeat-infringer review

1. A second operative incident opens a review. Opening the review does not suspend the account.
   A human confirmation creates incidents for the target's strike set: post authors, avatar and
   profile-link owners, and recorded non-administrator community setters. Administrator-owned
   avatars/profile-link images are included; topic and administrator-set community images are not.
2. Reviewers may record warning or no action, or mark an incident withdrawn, duplicate, or abusive.
   Each decision needs a rationale. The rationale is stored encrypted.
3. Only an administrator may restrict or terminate, and only while two operative incidents remain.
   Both actions use the existing account suspension. Termination refuses unsuspend until an
   administrator records reinstatement. Reinstatement does not unsuspend the account. Do that from
   the user admin panel after the reinstatement row exists. The decision, any new suspension,
   moderator action, and publication invalidation work commit together after the account lifecycle
   lock; a failed decision leaves the review open for retry.
4. Account deletion returns 409 while an operative incident remains, while an unresolved
   qualifying legal hold covers a placement for which the account is a retained party, or while an administrator has an
   open [preservation hold](#dmca-512h-subpoenas) on the account. An open review alone does not
   refuse deletion.
5. An operative incident keeps its case out of the retention sweep, and incidents never age out.
   The retention period is an approved-policy gate; see
   [Evidence retention deletion](#evidence-retention-deletion).

### Restoring when nobody can respond

Deleting the setter or author does not lift withholding or cancel a counter-notice filed first.
An accepted counter-notice keeps its receipt-based statutory schedule even if staff accept it
after account deletion. Without one, staff can admit and review emailed correspondence through
the existing appeal/counter-notice path. For a lift on staff's own initiative, an administrator may
call `POST /api/v1/copyright-notices/:id/restrictions/:restrictionId/lifts` with a written rationale
when the target has no live responding account. The action is API-only; there is no web control
yet. It refuses a live responder or an already lifted restriction. Verify the encrypted lift
record, reversed claimant notice, non-operative supported incident and restore intent. Another
active restriction or court/CCB blocker can still prevent restoration.

## Recovery scans

Continuously surface:

- form intakes without a screening and successfully parsed email intakes without a recommendation;
- provisional restrictions without a final human review, ordered by oldest restriction;
- open deadlines at or past `escalation_at`;
- open deadlines at or past `restoration_deadline_at` as incidents;
- incomplete action intents whose expected placement revision still matches;
- action intents rejected because the placement changed;
- placement rows whose PostgreSQL availability differs from the edge delivery registry;
- completed placement transitions whose CDN invalidation or registry publication is absent;
- undelivered correspondence, bounces, and exhausted delivery retries; and
- agent/parser failures routed to staff rather than accepted automatically.

For a pending restore intent, re-run the copyright eligibility transaction. Do not manually mark it
complete. The transaction must take the shared placement lock and recheck every copyright restriction
and target-specific hold. The media worker separately owns the atomic authoritative check of every
non-copyright blocker before delivery changes. If the placement revision changed, abandon the stale
intent through the domain recovery path and create no replacement until staff confirms the new
placement is within the case.

For an edge mismatch after a failed or rolled-back publication, use the existing media-delivery
worker's durable exact-key repair reconciliation. A wakeup references an already committed registry
row through a restrictive foreign key; repair joins its typed tuple and rechecks committed binding
authority before publishing recovery. A first registry insert that rolls back leaves no prior allow
or repair marker. Never manufacture an allow or manually advance a generation. See the
[media-delivery safety protocol](../overview/architecture/services/media-delivery-safety/README.md) for the
publication fence, repair markers, and bounded reconciliation contract.

The same protocol describes abandoned final claims: reconciliation marks them failed while
preserving generation and attempt evidence. After investigating the provider failure, use the
existing media-delivery registry replay control to reopen failed records. A stale final claim no
longer needs manual database repair, and exhausted records cannot block later recovery pages.

An ordinary active restriction has no late-hold provenance binding; that absence is expected.
Resolving its final qualifying hold reopens the original eligible restore in the same transaction
as the immutable resolution and replay audit. Assessing a previously unassessed filing uses the
same transaction-owned replay. Both retain the original intent, restriction, deadline and expected
revision; neither creates ordinary restoration authority.

The existing copyright action reconciler automatically recovers historical blocked restores after
a court or CCB filing has been assessed, before creating due statutory intents and enqueueing pending
actions. Each case is fenced and rechecked against its original counter-notice scope and current
assessment, human review, deadline, unresolved or unassessed filings, and current placement safety.
Repeated scans leave ineligible work unchanged. Exhausted provider-failed intents are excluded from
automatic recovery and still require explicit operator replay.

If a historical restore remains blocked, inspect those original facts and the lifecycle ledger.
Do not fabricate a hold binding, replace its deadline, copy a newer placement revision into the
intent, or mark delivery complete by hand.

For a cross-store failure, PostgreSQL remains the legal workflow record. Keep the application
projection fail-closed, replay the idempotent edge-registry publication, invalidate the exact
placement path, and verify both a cached and uncached request before acknowledging delivery. Never
change the PostgreSQL revision merely to make the edge registry match it.

## Review-target page

The `copyright-review-target-page` job on the `notifications` queue runs every five minutes. When
any count below is above zero, it sends one Sentry warning named `copyright_review_target_breach`.
Its `reason` tag has the same value, and one boolean tag per count shows which counts are set:

- `waiting_past_target` counts notices with a staff-queue item open longer than
  `reviewTargetMinutes`. It uses the queue's actionable paging view:
  - a form intake awaiting review, an appeal or counter-notice with no moderator review, or a court
    or CCB filing awaiting assessment, timed from receipt. An assessed qualifying hold awaiting
    resolution does not count;
  - an active restriction with no human review, timed from when it was imposed;
  - an unreviewed staydown match, timed from when the match was created;
  - a failed media action or failed or bounced delivery, timed from the failure on the same
    `reviewTargetMinutes` timer; and
  - a compliant assessment with a target it has not yet restricted, timed from the assessment for
    staff assessments, or from notice receipt for automated assessments. Each notice counts once,
    including requests pending while automated enforcement is disabled.

  Deadline items are left out here because the two counts below cover them.

- `email_intakes_waiting_past_target` counts email intakes on the email-review queue received
  longer than `reviewTargetMinutes` ago. It uses the queue's own rule, so the page and the queue
  agree. An intake counts even when its parse was never recorded; the queue lists it with
  `parse_status` `unparsed`.
- `missed_escalation` counts notices with an open deadline at or past `escalation_at`.
- `missed_restoration_deadline` counts notices with an open deadline at or past
  `restoration_deadline_at`. Those notices also count as missed escalations.

`reviewTargetMinutes` is in the `copyright` dynamic-config namespace. Only a developer or an
administrator can change it, and the namespace history records each change. The default is `0`,
which means unset: both waiting counts stay off. Set it to the approved target in whole minutes,
at most 10,080 (one week). The service targets above are not applied until someone sets this value.
Missed deadlines page even while the target is unset.

The event holds each count and up to 20 notice or email intake IDs per count, oldest first. It
has no claimant, poster, work, correspondence, sender, subject, or body fields. Open each case from
the staff queue by notice ID and triage it as described in [Queue triage](#queue-triage). Open each
email from the email-review queue by intake ID. A `failed` or `unparsed` email has no parsed fields
or agent recommendation, so review the original MIME object and record a manual-fallback reason
with the decision. The page says so: `Parse failed: <error>` for a `failed` parse, `No parsed
email` for an `unparsed` one, and `No agent recommendation yet` while no recommendation exists.
Download the original from the same page (unless SES withheld it, see
[Quarantined originals](#quarantined-originals)) and enter the statutory fields by hand. It also
has no parsed sender, so rejecting it queues no reply unless you type
one (see [Queue triage](#queue-triage)). An email is `unparsed` for a moment while the SES worker runs. One that stays
`unparsed` for more than a few minutes means the worker keeps failing before it records a parse,
or copyright intake was switched off mid-flight: check the worker's errors. Treat a missed
restoration deadline under [Incident response](#incident-response).

The Sentry alert rule that routes this warning and its on-call destination are not in this
repository and are not set up yet ([#1230](https://github.com/vouchington/vouchington/issues/1230)).
Until they exist, the warning appears only as a Sentry issue. The job has no throttle beyond its
five-minute schedule, so a breach repeats every sweep until it clears.

A qualifying court or CCB hold blocks the restore but does not cancel or resolve the deadline. A
deadline stops paging while every still-restricted counter-notice target is covered by an
unresolved qualifying hold and no court or CCB filing on the case remains unassessed. It pages
again after resolution if restoration is still incomplete. Unassessed filings never silence the
missed-escalation or restoration-deadline page; the staff queue display remains unchanged.

## Evidence retention deletion

The `copyright-evidence-retention` job on the `notifications` queue runs hourly. It deletes the
evidence and claimant personal data of old `us_dmca` cases, and keeps the minimal record that the
repeat-infringer count needs. What it erases, and what stops it, is in
[evidence retention](../requirements/moderation/COPYRIGHT-NOTICES.md#evidence-retention). It does
nothing until you do all of the following, in order.

1. **Get a counsel-approved period.** Counsel sets how many days a case is kept after its last
   lifecycle event ([#1230](https://github.com/vouchington/vouchington/issues/1230)). Do not choose
   one yourself. It must cover the three-year limitation period and any restoration and
   repeat-infringer need counsel identifies.
2. **Confirm the evidence-bucket permissions.** The worker role needs `s3:ListBucketVersions`,
   `s3:DeleteObjectVersion` and `s3:DeleteObject` on `S3_BUCKET_COPYRIGHT_EVIDENCE`
   ([#1229](https://github.com/vouchington/vouchington/issues/1229)). Without them every erasure
   fails and nothing changes, which is safe but noisy.
3. **Confirm the account data export tolerates erased rows** ([#1754](https://github.com/vouchington/vouchington/issues/1754)).
   An erased column is the literal `erased`, which does not decrypt. The export reads it as
   `[erased by the retention policy]` instead of failing, and the sweep clears the claimant,
   requester and submitter links in the same transaction that erases a case, so the export of an
   account that was party to an erased case loses that case's own filings. The other party's
   `copyright-cases.csv` row stays, with `erased_by_retention_at` set and no claimant attribution.
   Before enabling the switch, request an
   [account data export](../requirements/users/ACCOUNT-DATA-EXPORT.md#copyright-records) for an
   account that was party to a case the sweep has erased (in staging after a first run) and confirm
   it completes. Do not enable the switch if it fails.
4. **Check for open legal process.** An open [preservation hold](#dmca-512h-subpoenas) on an
   account keeps every case that account is party to out of the sweep, and the period restarts
   when the hold is released. The sweep cannot see legal process that no hold records: a request
   about an email-only claimant, who has no account, or a matter nobody placed a hold for. Place
   the hold first, and keep the switch off while counsel has an open matter over copyright
   records that a hold cannot cover.
5. **Set the period, then the switch.** In the admin dynamic-config page, open the `copyright`
   namespace (developer role). Set `evidenceRetentionDays` to the approved whole number of days,
   then set `evidenceRetentionDeletion` to `true`. Each change is recorded in the namespace
   history. The first run after that erases every case already past the period, 25 cases an hour.

To stop, set `evidenceRetentionDeletion` back to `false`. Erased cases stay erased: the data is gone.
Setting `evidenceRetentionDays` to `0` also stops it.

**Reading a failure.** When a case cannot be erased, the job still completes and sends one Sentry
warning, `copyright_retention_erasure_failed`. It carries the counts and the failed notice ids
(at most 25 a run), each with the error class (and code, for an S3 error). It never carries a key,
claimant, or message text.
The case keeps all its data and is retried on the next run, so a missing permission repeats this
warning every hour while the switch is on. The Sentry alert rule that routes it is not set up yet
([#1230](https://github.com/vouchington/vouchington/issues/1230)). Fix the cause rather than
turning the warning off.

**What staff see afterwards.** An erased case still opens in the staff queue and the case view. The
claimant contact and screening rationale read `[erased]`, a court or CCB hold statement is empty,
and an email intake shows no parsed fields or agent recommendation. The raw `.eml` download is
unavailable. The repeat-infringer account view is unchanged, and its incident counts are the same.

**Not covered.** The sweep leaves EU and UK cases, repeat-infringer reviews and decisions, guest
capabilities, and email that was never promoted to a case
([#1660](https://github.com/vouchington/vouchington/issues/1660)). A case with an active restriction
or an operative incident is never swept. If a claimant asks for erasure before the period ends,
that is a data-subject request for counsel, not something this switch handles.

## Urgent review

Urgent work has no per-case alert rows or acknowledgements. Two mechanisms surface it:

- queue urgency: the staff case queue lists missed restoration deadlines first, then deadlines past
  escalation or unassessed court or CCB filings, then other open work (see [Queue triage](#queue-triage)); and
- the [review-target page](#review-target-page): a five-minute sweep sends a Sentry warning while
  work is late, and the Sentry alert rule that would route it to on-call is not set up yet.

Do not delete a delivery intent, deadline, or notice to make either clear. Clear the underlying
fact through the normal case workflow.

## Incident response

For a missed human-review target, missed statutory deadline, evidence-integrity mismatch, public
privacy leak, or media-delivery bypass:

1. stop the affected automation without deleting legal records;
2. preserve logs, source evidence, lifecycle events, and current placement revisions;
3. notify the staffed legal/moderation owner and privacy/security owner as applicable;
4. correct the case through append-only assessments, resolutions, or lifecycle events; and
5. verify member projections, origin denial, cached renditions, and affected notifications before
   resuming automation.

Never call the destructive image-deletion path to implement a copyright restriction. Never update or
delete a submission, evidence artifact, assessment, lifecycle event, restriction, deadline, or
action-intent record by hand.

## DMCA §512(h) subpoenas

This procedure routes a subpoena to counsel. It is not legal advice. Counsel decides validity,
scope, user notice, and what is produced. Keep the matter file, counsel contacts, and produced
copies in the private operations repository.

Under [17 U.S.C. §512(h)](https://www.law.cornell.edu/uscode/text/17/512), a copyright owner can ask
the clerk of any US district court to issue a subpoena. It orders Voucha to disclose information
sufficient to identify an alleged infringer, to the extent Voucha has it.

1. **Intake.** Subpoenas are served on the designated agent, by post or process server at the
   registered address or through the designated inbox. Record when and how it was served, and
   send it to counsel the same day. A subpoena emailed to the designated inbox becomes an email
   intake in the email review queue. Do not approve it, because approval admits it as a copyright
   notice. Do not reject it either, because rejection queues the standard notice-rejection reply
   to the parsed sender (or to an address staff type when none was parsed).
   - **Record as legal process.** Open the intake on the email review page (`/copyright/email-review`)
     and choose **Record as legal process**. Enter a short reason of up to 1,000 characters, such as
     a matter id, then confirm. Do not put the requester's name or the subpoena text in it. The
     reason is stored encrypted and never logged, shown, or returned in an error. The intake
     closes with no reply and no email of any kind. It opens no case and creates no assessment,
     restriction, or claimant-visible event. It leaves the queue, and the
     [review-target page](#review-target-page) stops counting it. The intake's review row records
     who decided and when.
   - **It is final.** A second decision on the intake, including a rejection or an approval, returns
     `409`, and nothing undoes it. Record it once the subpoena is with counsel.
   - **Initial intakes only.** The action is not offered on a reply that is linked to a case thread
     or waiting for its root case. If a subpoena arrives that way, ask counsel before deciding
     it: rejecting it as correspondence sends no email, but it does write a case event.
2. **Validity checks.** Before anything is disclosed, record for counsel whether:
   - a clerk of a US district court issued and signed it;
   - it attaches or follows a notification that meets §512(c)(3)(A);
   - it attaches the requester's sworn declaration that the identity is sought only to protect
     rights under Title 17;
   - its URLs identify material hosted on Voucha, and which copyright case and exact placements
     they match, if any; and
   - its return date and any required format.

   A missing element is for counsel to weigh, not a reason to let the return date pass.

3. **Counsel review.** Nothing is disclosed until counsel approves the scope in writing. Counsel
   decides whether to comply, narrow the request, object, or move to quash. Section 512(h)(6)
   applies the Federal Rules of Civil Procedure for subpoenas duces tecum. Staff do not tell the
   requester whether an account exists.
4. **User notice.** The product has no channel for notice of legal process. If counsel approves
   notice and no court order or law forbids it, send it from the operator mailbox before any
   production, so the user can respond. Record the date it was sent in the matter file.
5. **Preservation.** If counsel directs that the account's records be preserved, an administrator
   places a **preservation hold** on the account. The legal holds in
   `copyright_notice_legal_hold_assessments` are a different record: they capture only §512(g)(2)(C)
   court and CCB filings and change restoration. Never record a subpoena as a court or CCB filing,
   or as a submission of kind `court_or_ccb_hold`.
   - **Place and release.** Use the "Legal preservation hold" card in the user admin panel
     (`/user/<id>/admin`, administrators only; moderators and reviewers cannot see or call it).
     Enter a short matter reference of up to 500 characters, such as a matter id. Do not put the
     requester's name, the subpoena text, or the account holder's data in it. It is stored
     encrypted, shown only to administrators, and never logged. The hold has no duration or scope:
     counsel decides when it ends, and an administrator releases it from the same card. Only one
     hold is open per account at a time.
   - **Effect.** While a hold is open, deletion of the account by the user or by an administrator
     returns the same `409` as for an operative incident or a court or CCB hold. The message does
     not say which, so it does not reveal that legal process exists. A hold does not copy or freeze
     any other record. It only stops the account being deleted.
   - **Audit.** Placing and releasing each write a moderator action (`preservation_hold_place`,
     `preservation_hold_release`), visible to administrators in the admin modlog and to no
     community. The hold row records who placed it and when, and who released it and when. Rows are
     never deleted, so this history outlives the account and its eventual hard delete (see
     [account deletion](../requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md#deletion-refusals)).
   - **Already deleted.** A hold cannot be placed on an account that is already deleted. If the
     subpoena arrives after deletion, tell counsel the same day: the account's personal data was
     scrubbed at deletion, and the soft-deleted row is purged 90 days after it.
   - **Case evidence.** Copyright case records are append-only, and the only thing that destroys
     case evidence is the evidence retention sweep, which is off by default. A preservation hold
     keeps the sweep away from every case the held account is a party to, as claimant, as the
     author of a targeted post, as the submitter of an appeal or counter-notice, or as the subject of
     a repeat-infringer incident (see [Evidence retention deletion](#evidence-retention-deletion)).
     A hold on a different account, or none, does not.

   If counsel also directs a copy of the data, an administrator requests an
   [account data export](../requirements/users/ACCOUNT-DATA-EXPORT.md) for the account and saves
   the download to the matter file before its link expires. The export omits session IP
   addresses, so capture any that counsel needs from `user_sessions`. The account holder cannot see
   this export: it is recorded against the administrator who requested it, so their data page, its
   status stream and its download link do not return it, no ready email is sent, and it does not
   block their own export request. Only that administrator can read its status and download link,
   through the data-request route on the account. Counsel still decides separately, in step 4,
   whether to give the user notice of the legal process.

6. **Records that may exist.** Produce only what counsel approves.
   - Account: the export categories (username, profile, creation date, email addresses, phone
     numbers, OAuth account and passkey metadata), plus `user_sessions` rows. Each row holds a
     device name, a user agent, a last-seen time, and the IP address captured at the latest
     login or refresh. Earlier addresses are overwritten.
   - Copyright case: the targets with their captured placement revisions, the immutable
     submissions, assessments, restrictions, lifecycle events, and correspondence, plus private
     evidence artifacts identified by SHA-256 digest. A counter-notice, if filed, holds the poster's
     name, address, and telephone number, and the claimant has already received it with the
     forwarded counter-notice.
7. **Close out.** In the matter file, record the requester, the service date, the validity
   checks, counsel's decision, the notice sent, and what was produced and when. The case record
   has no subpoena event or correspondence type, so don't add one to it.

## Statements of reasons and decision notices

US copyright decisions persist the exact statement sent to each participant. If counter-notice or
court/CCB submission guidance existed before the decision, disclose AI assistance with the shared
sentence “Automated tools assisted with processing this case.” The shared statement-of-reasons
builder covers builder-backed decisions. Fixed-text counter-notice decision emails, in-app decision
updates, and acceptance forwarding append that same sentence; counter-notice filing receipts are
not decisions and exclude it. Future hold-decision notices must use the shared builder. Community
owners who are information-only recipients have no case, appeal or counter-notice access; their
in-app notice links to the community. Administrator lifts send a reversed claimant decision once per notice.
Their `administrator_lift` restoration notice is created only when delivery lifts the restriction,
with the actual outcome; topics have no owner recipient. Check the private delivery
intent state and `sent_at` before treating a notice as informed; retry a failed notice through the existing Delivery failures replay; a human reversal and later restoration
are separate notices. An expired counter-notice waiting period is disclosed as automatic restoration. A busy account lifecycle transition returns a retryable conflict before legal changes and delivery obligations commit; retry the operation after that transition completes. Participants see their own stored texts under “Notices sent to you”; staff use
the existing private delivery aggregate. See the [delivery requirements](../requirements/moderation/COPYRIGHT-NOTICES.md#immutable-decision-statements).

Before enabling intake, supply `COPYRIGHT_INTAKE_ENABLED` to the email delivery worker as well as the
backend. A successfully parsed new email with DMARC pass may queue an arrival receipt; this can coexist
with a subsequent staff reply. Replay failed staff replies separately from receipts. Promotion preserves
the original receipt and queues a case acknowledgement with the applicable central wording.
