# Copyright Notice Operations

Recovery, activation, and escalation procedures for the durable lifecycle in
[Copyright Notice Lifecycle](../requirements/moderation/COPYRIGHT-NOTICES.md). The
[screening authority contract](../requirements/moderation/COPYRIGHT-NOTICES.md#current-screening-authority)
governs re-screening recovery. This is not legal advice. Production contacts, credentials, response
rosters, and infrastructure identifiers belong in the private operations repository.

Every switch below lives in the audited `copyright` dynamic-config namespace and defaults to off.
Shipping a capability never enables it; enabling is an operator decision recorded in the namespace
history.

## Copyright MCP decision tools

`copyright.mcpDecisionTools` is enabled only by a user with the `developer` role through the
namespace PATCH. The `update_dynamic_config_namespace` MCP tool refuses enablement, so an agent can
never grant itself these tools; setting it to `false` through MCP stays allowed. Before enabling,
review the supported decision groups and exclusions
and authorize the administrator's OAuth client with exact `copyright-notices:write` and
`copyright-notices:read` grants (an admin umbrella grant or API key is insufficient). Disabling hides
the tools; the staff REST decision routes are unaffected.

Email approval through MCP takes the same body as the staff route. Read the raw email in the staff web
interface first, then supply every claimant field, statutory declaration, and hosted image yourself.
The recommendation is guidance only and is not compared with your values. Every decision requires a
rationale, retained only in the encrypted per-call [MCP audit](../overview/architecture/services/mcp-tools/README.md#mcp-audit-log).

## DSA statement database

`copyright.dsaSorDatabase` and `copyright.dsaSorDatabaseFrom` default to off and empty. Set the start
date (`YYYY-MM-DD`, UTC) to the real date the Article 19 exemption ended, including its 12-month
run-off; an unset date blocks all enqueueing and HTTP calls even with the switch on. Submissions are
public and irreversible: there is no update, withdrawal, or deletion.

Before activation, complete [Commission onboarding](https://transparency.dsa.ec.europa.eu/page/onboarding-documentation)
and sandbox validation, hand the two worker-only credential variables to the infrastructure owner
through the [env contract](../overview/infrastructure/env-var-contract.md), and get the owner's
approval of the wording and automation. Blank credentials leave work pending with one warning per sweep.

A restriction whose payload cannot be built becomes a terminal failed work item with an `http_<status>`
code and one warning tagged with the restriction id. Fix the data, then replay. Items that exhaust
retries or hit a permanent validation failure dead-letter, reporting ids and status only. Inspect
configuration and the error class before replaying, and never put tokens or response bodies in logs.
An administrator replays a dead-lettered item through the replay route; a payload-build failure is
rebuilt first and returns `{ replayed: false }` while the data still cannot be built. See the
API contract and
[queue recovery matrix](../overview/architecture/queues/notifications/README.md#dsa-statement-database).

## DSA transparency report

`copyright.dsaTransparencyReports` gates the staff export (disabled: `404`). Export through the
copyright EU reports route as JSON, `csv_notices` (Commission CSV Part 4), or `csv_complaints`
(Part 7); CSV needs UTC-midnight bounds. GET is read-only; POST records the six EU counts for the period.
The exports contain aggregate copyright figures only.

Publication is the operator's job. Before publishing, add the Service name, merge with the platform's
other moderation figures, and supply the TOTAL row. An empty Value means not computed; never present
it as zero or not applicable. The API report contract
defines the figures and formats.

## Trusted flaggers

The registry is staff API tooling with no web screen. Staff copy designations by hand from the
Commission's published list; there is no automatic import. An administrator creates an entry with the
entity, linked Voucha account, awarding Digital Services Coordinator, member state, award date, and
area wording. Record `intellectual_property` only for an intellectual-property designation, otherwise
`other`. Status changes (suspension, reinstatement, revocation) are appended with a reason from the
designation record; revocation is final, and a wrong entry is corrected by revoking and re-creating.

A signed-in EU notice captures an eligible account match at receipt even while
`copyright.trustedFlaggerPriority` is off; guest and UK notices never match, and later entries do not
change earlier notices. Only intellectual-property matches get copyright priority or count in
reporting; every matched notice still needs human review. Priority also requires an unwithdrawn
`eu_dsa` approval ([intake activation](#intake-activation)).

## Queue triage

The staff case queue lists missed restoration deadlines first, then deadlines past escalation or
unassessed court or CCB filings, then other open work, each oldest wait first. Work it top down.
Trusted-flagger matches sort first within their urgency tier but never ahead of a more urgent case.

1. Confirm the original submission and evidence digest exist. Never reconstruct a missing email from
   agent output.
2. For email, compare the structured extraction with the inert original and correct it before
   accepting. Verify each extracted declaration against its recorded source excerpt. If no
   recommendation exists, use the explicit manual-fallback reason; never silently bypass the agent.
3. Confirm the target is an exact Voucha-hosted placement and preserve its captured revision. Staff
   approval resolves any existing placement whatever its audience. A claimant form only reaches you
   with targets that claimant could open directly; a rightsholder who cannot see the material needs
   the email path. The selection can also name an avatar, profile-link image, topic logo or hero, or
   community profile or banner: verify the displayed surface and immutable setter/uploader provenance.
   See [target parties](../requirements/moderation/COPYRIGHT-NOTICES.md#surface-targets-and-parties).
4. Record missing elements as an assessment and request information; do not silently reject a
   substantially compliant notice for failing to match Voucha's form wording. For a form-filed case,
   send the request from the case's Guest access section; it goes to the claimant address on the
   notice. A case with no retained claimant email refuses the request.
5. To reject an email or ask for more information, check who will receive the reply. A parsed sender
   receives it. An email with no parsed sender (`failed` or `unparsed`) queues no reply unless you type
   an address; do so only when the original MIME shows a sender worth answering. If a queued reply
   fails or bounces the intake returns to the email-review queue.
   - **Retry reply** appears only for `reply_failed`; it resends the same stored text, recorded under
     your name. A `reply_bounced` item has no retry: contact the sender another way.
   - **Reject email intake** closes the intake without opening a case and needs the rationale (plus the
     manual-fallback reason when no recommendation exists).
   - **Request information** closes the intake the same way and sends your message after the fixed
     reply text, so ask only for what the sender must supply, such as the work and each allegedly
     infringing URL.

   Arrival receipts and staff replies are separate obligations: a receipt failure never raises
   `reply_failed`.

6. While automatic provisional withholding is off, or a notice fails an abuse gate, a clear-screened
   signed-in form waits here like a guest form. Accept it to withhold its targets, or reject it. The
   screen is advisory only.
7. If a signed-in case was provisionally restricted automatically, record a human `confirm`, `modify`,
   or `reverse` decision even when nobody appeals.

### Email authentication and malware verdicts

SPF, DKIM, DMARC, and spam failures add an Authentication risk note. It is context, not a decision: a
real claimant can fail these through a forwarder, so never reject a notice for it alone. Not reported
means unverified, never Pass.

### Quarantined originals

When SES reports malware (Malware: Fail) the original is withheld and the raw `.eml` route answers
`409 COPYRIGHT_EMAIL_QUARANTINED`. Review the parsed text and decide normally; do not look for another
way to open the original, and report a suspected false positive to engineering. For Inconclusive,
Check failed, or Not reported verdicts the download stays available (a sender can force Check failed
with a malformed message, and blocking would keep a valid notice from review). Download only if the
parsed text is not enough, and open it in an isolated environment.

## Intake activation

Keep `COPYRIGHT_INTAKE_ENABLED=false` until all of the following are verified in the target
environment:

- the published address belongs to the registered US designated agent and production inbox routing
  assigns `copyright` only to the trusted `copyright-incoming/` S3 prefix;
- `S3_BUCKET_COPYRIGHT_EVIDENCE` is private, encrypted, versioned, access-logged, retention-reviewed,
  and accessible only to the required workers and authorized evidence tooling;
- form Turnstile secrets, route rate limits, scheduled agent reconciliation, and moderator queues are
  live, and the [review-target page](#review-target-page) warns on late work;
- reversible placement withholding and origin/CDN denial pass end-to-end, with cold and warm cache
  evidence for withhold and restore (the infrastructure change must authorize every placement request
  at the viewer edge, deny direct origin access, publish the delivery registry, and invalidate cached
  paths after a transition);
- receipts, poster notices, approved correspondence, retry/bounce handling, appeal and counter-notice
  workflows are live; and
- the owner has approved the repeat-infringer policy, retention schedule, templates, and staffing, and
  has updated the Terms, Privacy, and Community Guidelines articles and the designated-agent page to
  describe the activated process. The footer must link the Copyright policy, designated-agent status,
  and repeat-infringer policy.

Never approve `eu_dsa` or `uk` before the staff territorial screen (#1906) has shipped, and never
approve `uk` without the owner's written sign-off. Do not advertise EU or UK statutory intake until
the owner completes representative appointment and the applicability review. Approval and withdrawal
are administrator-only (copyright jurisdiction policies) and independent of
`COPYRIGHT_INTAKE_ENABLED`; neither authorizes the other.

The switch is the intake kill switch. It stops only new claimant intake (notice forms, staff approval
of an emailed notice, and the email-recommendation and form-screening AI jobs) with `503`. In-case
responses (appeals, counter-notices, guest filings, EU and UK redress and complaints), every staff
decision, and designated-agent email ingest stay open. Manage a downstream outage with the individual
delivery and enforcement controls, not this switch.
[`intake-kill-switch-routes.test.mts`](../../backend/api/v1/copyright-notices/intake-kill-switch-routes.test.mts)
fails when a non-GET copyright route has no class. Staff approval of an already received form intake
can still open a case while the switch is off. EU and UK approval controls new receipts only:
withdrawal does not stop staff from deciding a received notice, delivering its notices, processing
redress, or restoring, which use the approval snapshot on the receipt. Do not route an existing case
through new-intake approval.

The web staff queue uses `territorial_notice_review` for a received notice without a live decision and
`territorial_decision_reopened` after a complaint `revoke` of `no_action`. `restrict` requires one or
more post-image targets and the normal human-compliant assessment; `no_action` has no targets or
withholding. The public explanation goes to the poster and notifier, so keep personal data out of it.

### EU complaints and Art. 21 recording

Review `territorial_redress_review` for a complaint awaiting a decision on the live territorial
decision. Use the staff case's per-recipient informed time and complaint window, not intake time or a
case-wide clock; only sent decision notices count, and a bounced message does not. For an EU guest
notifier, locate the matched reply to the decision email and explicitly admit it as `complaint`; the
window is measured at the reply's `received_at`, so admission delay does not close it. Mail alone
authorizes no change; an account notifier uses the case page.

Record an Art. 21 referral through the dispute-settlement routes in the
API contract.
Check the body name, referral time, and named party against the received case, and record one outcome.
Perform the staff case action first, then record implementation: the referral or outcome itself does
not restore media. UK has no EU filing/complaint UI or Art. 21 recording.

### Intake paused: mail and agent dispatch

Designated-agent email is still ingested while the switch is off: the SES worker and its reconcile
sweep copy each message into the evidence bucket, parse it, link a reply to its case, and list it in
the staff email queue and [review-target page](#review-target-page). Both `S3_BUCKET_SES_INBOUND` and
`S3_BUCKET_COPYRIGHT_EVIDENCE` must be configured wherever mail is received; a
`scheduled_job_config_missing` warning in a deployed environment means a bucket is misconfigured. No
email contents reach a model and no automatic receipt is sent. A sender hears from Voucha only when
staff act. When the switch is turned on, the reconciler sends every ingested email with no
recommendation and no staff decision to the recommendation job.

The `reconcile-copyright-agent-dispatches` sweep keeps running while off. It holds back the dispatches
that start work for new intake (email recommendation and form screening, whose jobs also check the
switch themselves) and keeps those belonging to an open case (appeal recommendation, submission
guidance, saved form screening applied). A held-back dispatch stays pending and the first sweep after
enablement sends it. To stop automated withholding during an incident, turn
[`automaticProvisionalWithholding`](#automatic-provisional-withholding) off; the intake switch does not.

### Recording an emailed filing while intake is off

Emailed counter-notices and court/CCB filing notices start their section 512(g) clocks on receipt,
and a reply to a message Voucha sent is matched to its case automatically. Record it from the queue
instead of waiting for the switch:

1. Open the message in the staff email intake queue. Read the inert original and confirm it is a
   filing for the case its reply thread matched.
2. Record it as correspondence with its kind (`supplement`, `appeal`, `counter_notice`, `withdrawal`,
   or `court_or_ccb_hold`), exact target ids for an appeal or counter-notice, the structured fields
   verified against the original, a rationale, and a `manual_fallback_reason` while no recommendation
   exists.
3. To decline an unrelated or incomplete reply, use the correspondence-rejection route with the same
   fallback reason.
4. Recording sends the sender nothing; the staff review queues the deterministic notices as usual.

An email that matched no case is a new notice: staff can reject it, but approval returns `503` until
the switch is on. If it also carries a statutory filing for an existing case, handle it from the
designated-agent inbox, which remains the source of truth for 512(g) clocks until then.

## Automatic provisional withholding

Launch is moderator-first: `automaticProvisionalWithholding` stays `false`. Before enabling it:

- publish the GDPR Article 22 automated-decision disclosure;
- set every abuse gate in the namespace (`automaticWithholdingMinTrustTier`,
  `automaticWithholdingMinAccountAgeDays`, `automaticWithholdingClaimantDailyCap`,
  `automaticWithholdingPosterDailyCap`). They launch unset (-1); while any is unset nothing is withheld
  automatically, so an incomplete setup fails closed. There are no defaults: the owner chooses each,
  and zero is a real value (a cap of 0 refuses every notice); and
- flip the switch with the namespace PATCH, never by editing stored state, because the audited
  off-to-on change opens the automation window.

Enabling does not release a backlog. Automation acts only on notices received after the audited
off-to-on change; earlier clear-screened notices and pending automated assessments stay in the staff
queue (`enforcement_pending`) until a moderator accepts or rejects them. Each automatic restriction
still needs its own human decision. A notice that fails a gate (suspended or too-new claimant, low
trust tier, claimant or poster over its 24-hour cap, or any non-post target) is never dropped and is
not retried when the cap clears; a moderator accepts or rejects it.

The staff case shows the claimant's misuse ledger (withdrawn, rejected on review, reversed by
counter-notice or appeal). Use it when deciding whether to suspend a notifier from the user admin
panel; nothing suspends one automatically. Suspending a notifier reverses their unreviewed automatic
restrictions within a sweep; confirmed restrictions stay. Disabling stops new automated assessments;
pending requests stay unenforced in the queue and existing restrictions stay in place.

## Staydown matching

`staydownMatching` stays `false`. Staydown binds only an online content-sharing service provider under
DSM Directive Article 17(4)(b)-(c), so **the owner must decide whether Voucha is one before anyone
enables the switch.** See [Staydown matching](../requirements/moderation/COPYRIGHT-NOTICES.md#staydown-matching).

When on, a moderator-confirmed image enters a registry and an identical or near-duplicate upload
creates a "Possible re-upload" item in the case queue. The upload still publishes; the feature never
blocks, hides, or delays one. To triage:

1. Open the case and compare the upload with the confirmed image. A near-duplicate can be lawful use
   (quotation, criticism, review, parody, pastiche); Article 17(7) forbids treating a match as a finding.
2. If the upload infringes, handle it through the normal notice workflow.
3. Select **Mark reviewed** so the item leaves the queue. A stale unreviewed item keeps the case in the
   queue and counts toward the review target.

Uploads made while the switch was off are not matched afterwards, and lifting a restriction removes its
entry and matches. A near-duplicate that uploads before the confirmed image's perceptual hash exists is
matched only when its `staydown-hash` job is replayed.

## Counter-notice and hold handling

1. Keep informal appeals separate from statutory counter-notices.
2. Assess the counter-notice without editing its receipt. A compliant assessment creates one durable
   deadline from the referenced submission's receipt time.
3. Promptly forward the complete counter-notice to the original claimant using the deterministic
   statutory template.
4. Review all case correspondence before restoration and record the exact targets each filing covers.
   Restoration of the whole case stays refused while any admitted court or CCB filing has no
   assessment. Assess the filing by the earliest open counter-notice deadline's `escalation_at`
   (start of business day 14), leaving day 14 to restore if it is rejected. A qualifying filing must
   come from the person who submitted the notification or their authorised agent (compare the email
   sender or guest capability holder with the original notice). A threat, unrelated filing, different
   claimant or material, non-commenced matter, or CCB filing outside the qualifying categories is not
   a hold.
5. Resolve a hold only with an immutable resolution record and staff rationale.
6. The submission-guidance panel is advisory evidence only: it never supplies the assessment or
   changes a deadline, restriction, restoration, or hold. Human review and the recorded filing receipt
   remain the source of statutory timing.

## Repeat-infringer review

1. A second operative incident opens a review without suspending the account. A human confirmation
   creates incidents for the target's strike set: post authors, avatar and profile-link owners, and
   recorded non-administrator community setters. Topic and administrator-set community images are not
   included.
2. Reviewers may record warning or no action, or mark an incident withdrawn, duplicate, or abusive,
   each with a rationale.
3. Only an administrator may restrict or terminate, and only while two operative incidents remain.
   Both use the existing account suspension. Termination refuses unsuspend until an administrator
   records reinstatement, which does not itself unsuspend; do that from the user admin panel. A failed
   decision leaves the review open for retry.
4. Operative incidents and open reviews do not refuse account deletion. Deletion returns `409` while an
   unresolved qualifying legal hold covers a placement the account is a retained party to, or while an
   administrator has an open [preservation hold](#dmca-512h-subpoenas) on the account.
5. An operative incident keeps its case out of the retention sweep and incidents never age out.

### Restoring when nobody can respond

Deleting the setter or author does not lift withholding or cancel a counter-notice filed first. Without
one, staff can admit emailed correspondence through the appeal/counter-notice path. For a lift on
staff's own initiative, an administrator may call the restriction lift route with a written rationale
when the target has no live responding account (API-only; it refuses a live responder or an already
lifted restriction). Verify the lift record, reversed claimant notice, and restore intent; another
active restriction or court/CCB blocker can still prevent restoration.

## Recovery scans

Continuously surface:

- form intakes without a screening and parsed email intakes without a recommendation;
- provisional restrictions without a final human review, oldest first;
- open deadlines at or past `escalation_at`, and at or past `restoration_deadline_at` as incidents;
- incomplete action intents, and intents rejected because the placement changed;
- placement rows whose PostgreSQL availability differs from the edge delivery registry;
- completed transitions whose CDN invalidation or registry publication is absent;
- undelivered correspondence, bounces, and exhausted delivery retries; and
- agent or parser failures routed to staff.

For a pending restore intent, re-run the copyright eligibility transaction; never mark it complete by
hand. If the placement revision changed, abandon the stale intent through the domain recovery path and
create no replacement until staff confirms the new placement is within the case. For an edge mismatch
after a failed publication, use the media-delivery worker's durable exact-key repair reconciliation;
never manufacture an allow or advance a generation by hand (see the
[media-delivery safety protocol](../overview/architecture/services/media-delivery-safety/README.md)).
After investigating a provider failure, use the registry replay control to reopen failed records.

The copyright action reconciler automatically recovers historical blocked restores once a court or CCB
filing is assessed, fenced against the original counter-notice scope and current placement safety.
Exhausted provider-failed intents are excluded and need explicit operator replay. If a restore remains
blocked, inspect the original facts and lifecycle ledger; do not fabricate a hold binding, replace its
deadline, copy a newer placement revision into the intent, or mark delivery complete.

For a cross-store failure, PostgreSQL remains the legal workflow record. Keep the application
projection fail-closed, replay the idempotent edge-registry publication, invalidate the exact placement
path, and verify both a cached and uncached request before acknowledging delivery. Never change the
PostgreSQL revision merely to make the edge registry match.

## Review-target page

The `copyright-review-target-page` job runs every five minutes and sends one Sentry warning,
`copyright_review_target_breach`, when any of these counts is above zero:

- `waiting_past_target`: notices with a staff-queue item (unreviewed form, appeal, counter-notice,
  court/CCB filing awaiting assessment, active restriction without human review, unreviewed staydown
  match, failed media action or delivery, or compliant assessment not yet restricted) open longer than
  `reviewTargetMinutes`;
- `email_intakes_waiting_past_target`: email intakes on the review queue received longer than
  `reviewTargetMinutes` ago, including `unparsed` ones;
- `missed_escalation`: open deadlines at or past `escalation_at`; and
- `missed_restoration_deadline`: open deadlines at or past `restoration_deadline_at` (these also count
  as missed escalations).

`reviewTargetMinutes` defaults to `0` (unset), which keeps both waiting counts off; set it to the
approved target. Missed deadlines page even while it is unset. The event carries counts and up to 20
notice or intake ids per count, oldest first, and no claimant, poster, work, or message content. Open
each case or email by id and triage it as in [Queue triage](#queue-triage).

A `failed` or `unparsed` email has no parsed fields, sender, or recommendation: review the original
MIME (unless withheld, see [Quarantined originals](#quarantined-originals)), enter the statutory fields
by hand with a manual-fallback reason, and note that rejecting it queues no reply unless you type an
address. An email stuck `unparsed` for more than a few minutes means the worker keeps failing before it
records a parse, or intake was switched off mid-flight: check the worker's errors. Treat a missed
restoration deadline under [Incident response](#incident-response).

A qualifying court or CCB hold blocks the restore but does not resolve the deadline. A deadline stops
paging while every still-restricted counter-notice target is covered by an unresolved qualifying hold
and no filing on the case is unassessed; it pages again after resolution if restoration is incomplete.

## Evidence retention deletion

The hourly `copyright-evidence-retention` job deletes the evidence and claimant personal data of old
`us_dmca` cases and keeps the minimal record the repeat-infringer count needs (see
[evidence retention](../requirements/moderation/COPYRIGHT-NOTICES.md#evidence-retention)). It does
nothing until you do all of the following, in order:

1. **Get an owner-approved period.** The owner sets how many days a case is kept after its last
   lifecycle event. Do not choose one yourself. It must cover the three-year limitation period and any
   restoration and repeat-infringer need.
2. **Confirm the evidence-bucket permissions.** The worker role needs `s3:ListBucketVersions`,
   `s3:DeleteObjectVersion`, and `s3:DeleteObject` on `S3_BUCKET_COPYRIGHT_EVIDENCE`. Without them every
   erasure fails and nothing changes.
3. **Confirm the account data export tolerates erased rows.** Erased columns read as
   `[erased by the retention policy]` instead of failing. Before enabling, request an
   [account data export](../requirements/users/ACCOUNT-DATA-EXPORT.md#copyright-records) for an account
   party to a case the sweep has erased (in staging after a first run) and confirm it completes.
4. **Check for open legal process.** An open [preservation hold](#dmca-512h-subpoenas) keeps every case
   that account is party to out of the sweep. The sweep cannot see legal process no hold records (an
   email-only claimant, or a matter nobody placed a hold for): place the hold first, and keep the switch
   off while an open legal matter covers records a hold cannot reach.
5. **Set the period, then the switch.** Set `evidenceRetentionDays` to the approved number of days,
   then `evidenceRetentionDeletion` to `true`. The first run erases every case already past the period.

To stop, set `evidenceRetentionDeletion` to `false` (or the days to `0`); erased data stays gone. When
a case cannot be erased the job still completes and sends the Sentry warning
`copyright_retention_erasure_failed` with counts, failed notice ids, and the error class, never keys or
claimant text. The case keeps its data and is retried hourly, so fix the cause (usually permissions).

Afterwards an erased case still opens in the staff queue with contact and screening rationale reading
`[erased]`, and the raw `.eml` is unavailable. The sweep leaves EU and UK cases, repeat-infringer
reviews, guest capabilities, email never promoted to a case, and any case with an active restriction
or operative incident. An erasure request before the period ends is a data-subject request for the
owner to decide, not something this switch handles.

## Data requests from email-only claimants

A claimant who only emailed the designated-agent mailbox has no account, so no self-serve
[account data export](../requirements/users/ACCOUNT-DATA-EXPORT.md#copyright-records) covers them. The
owner handles their GDPR Art. 15 request:

1. Find their email intakes with the retained-intake lookup below and check the claimant contact on
   each case. The review queue is not an inventory: decided intakes leave it.
2. Verify identity by replying to that same address. Release nothing to any other address.
3. Send the records within one month (GDPR Art. 12(3)), applying the redaction rule in
   [copyright records](../requirements/users/ACCOUNT-DATA-EXPORT.md#copyright-records) to anything
   about another party.

### Retained-intake lookup

An operator with trusted database and decryption access runs the read-only
`backend/scripts/lookup-copyright-email-intakes.mts` tool (`--help` for usage) in the target
environment with an existing, unsuspended copyright staff user's ID, entering the requester's address
at the prompt. Keep the output private. Repeat with `next_cursor` as the second argument until it is
null, continuing even when a page has no matches, because the cursor tracks scanned intakes. A failed
invocation provides no complete result: repeat that page. For every `raw_review_candidates` ID,
inspect the original MIME through the staff intake detail and compare its sender header with the
requester's address. Honor malware quarantine; if an original cannot be safely accessed, record the
unresolved gap for the owner rather than treating it as a nonmatch. Do not declare the lookup complete
until every page and candidate is checked. The cursor is bound to the requester address.

## Urgent review

Urgent work has no per-case alert rows. Two mechanisms surface it: queue urgency (see
[Queue triage](#queue-triage)) and the [review-target page](#review-target-page). Do not delete a
delivery intent, deadline, or notice to make either clear; clear the underlying fact through the normal
case workflow.

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

This procedure routes a subpoena to the owner, who engages a lawyer. It is not legal advice. The owner
decides validity, scope, user notice, and what is produced, on that lawyer's advice. Keep the matter
file, lawyer contacts, and produced copies in the private operations repository.

Under [17 U.S.C. §512(h)](https://www.law.cornell.edu/uscode/text/17/512), a copyright owner can ask a
US district court clerk for a subpoena ordering Voucha to disclose information sufficient to identify
an alleged infringer, to the extent Voucha has it.

1. **Intake.** Subpoenas are served on the designated agent, by post or process server or through the
   designated inbox. Record when and how it was served, and send it to the owner and engage a lawyer the
   same day. An emailed subpoena becomes an email intake. Do not approve it (approval admits it as a
   copyright notice) and do not reject it (rejection queues the standard reply to the sender).
   - **Record as legal process.** On the email review page choose **Record as legal process**, enter a
     short reason up to 1,000 characters such as a matter id (never the requester's name or subpoena
     text), and confirm. The reason is stored encrypted and never logged. The intake closes with no
     reply, opens no case, and leaves the queue and the review-target count.
   - **It is final.** A second decision returns `409` and nothing undoes it.
   - **Initial intakes only.** The action is not offered on a reply linked to a case thread. If a
     subpoena arrives that way, ask the owner before deciding it: rejecting it as correspondence sends
     no email but does write a case event.
2. **Validity checks.** Record for the owner and lawyer whether a district court clerk issued and signed
   it; it attaches or follows a notification meeting section 512(c)(3)(A); it attaches the sworn
   declaration that the identity is sought only to protect Title 17 rights; its URLs identify material
   hosted on Voucha and which case and placements they match; and its return date and format. A missing
   element is for the owner to weigh, not a reason to let the return date pass.
3. **Owner decision.** Nothing is disclosed until the owner approves the scope in writing. The owner
   decides whether to comply, narrow, object, or move to quash. Staff do not tell the requester whether
   an account exists.
4. **User notice.** The product has no channel for notice of legal process. If the owner approves notice
   and no court order forbids it, send it from the operator mailbox before any production and record
   the date in the matter file.
5. **Preservation.** If the owner directs that the account's records be preserved, an administrator
   places a **preservation hold** on the account. This is a different record from the legal holds in
   `copyright_notice_legal_hold_assessments`, which capture only 512(g)(2)(C) court and CCB filings and
   change restoration. Never record a subpoena as a court or CCB filing or a `court_or_ccb_hold`
   submission.
   - **Place and release.** Use the "Legal preservation hold" card in the user admin panel
     (administrators only) with a short matter reference up to 500 characters (never the requester's
     name, subpoena text, or account data). The hold has no duration; the owner decides when it ends and
     an administrator releases it from the same card. One hold is open per account.
   - **Effect.** An open hold makes deletion return the same `409` as a court or CCB hold, without
     revealing which blocker applies. After soft deletion it pauses only the 90-day final purge, not the
     immediate deletion phases or data they already erased. For an account soft-deleted more than 90 days
     ago, act promptly: without a hold it is eligible for the next purge.
   - **Audit.** Placing and releasing write moderator actions visible only to administrators, and the hold
     rows are never deleted. See [account deletion](../requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md#deletion-refusals).
   - **Case evidence.** The only thing that destroys case evidence is the retention sweep (off by
     default). A hold keeps the sweep away from every case the held account is party to (see
     [Evidence retention deletion](#evidence-retention-deletion)); a hold on a different account does not.

   If the owner also directs a copy of the data, an administrator requests an
   [account data export](../requirements/users/ACCOUNT-DATA-EXPORT.md) for the account and saves it to the
   matter file before the link expires. The export omits session IP addresses, so capture any needed from
   `user_sessions`. The account holder cannot see this export.

6. **Records that may exist.** Produce only what the owner approves. Account: export categories plus
   `user_sessions` rows (device name, user agent, last-seen, and the latest login IP only). Copyright
   case: targets with captured placement revisions, the immutable submissions, assessments, restrictions,
   lifecycle events, and correspondence, plus evidence artifacts identified by SHA-256 digest.
7. **Close out.** In the matter file record the requester, service date, validity checks, the owner's
   decision and the lawyer's advice, the notice sent, and what was produced and when. The case record has
   no subpoena event, so don't add one.

## Statements of reasons and decision notices

US copyright decisions persist the exact statement sent to each participant. If counter-notice or
court/CCB submission guidance existed before the decision, disclose AI assistance with the shared
sentence "Automated tools assisted with processing this case." Counter-notice filing receipts are not
decisions and exclude it. Check the private delivery intent state and `sent_at` before treating a notice
as informed; retry a failed notice through the Delivery failures replay. Staff use the private delivery
aggregate; participants see their stored texts under "Notices sent to you". See the
[delivery requirements](../requirements/moderation/COPYRIGHT-NOTICES.md#immutable-decision-statements).

Before enabling intake, supply `COPYRIGHT_INTAKE_ENABLED` to the email delivery worker as well as the
backend. Replay failed staff replies separately from receipts.
