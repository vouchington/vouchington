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

## Queue triage

The staff case queue (Moderation sidebar, Copyright, Case Queue) lists missed restoration deadlines
first, then deadlines past escalation, then other open work, each oldest wait first. Work it top
down. Each case shows why it is queued and how long its oldest open item has waited. The email
intake queue shows each message's wait age.

1. Confirm the original submission and evidence digest exist. Never reconstruct a missing email from
   agent output.
2. For email, compare the structured extraction with the inert original and correct it before
   accepting the case. Verify each extracted declaration against its recorded source excerpt. If no
   recommendation exists, use the explicit manual-fallback reason; never silently bypass the agent.
3. Confirm the target is an exact Voucha-hosted placement and preserve its captured revision. Approval
   refuses a target whose post is not publicly visible (private, draft, unpublished, or otherwise
   hidden) with "Hosted image placement is not publicly visible". Nothing is consumed, so correct the
   target or reject the intake. A claimant form never reaches you with such a target: the form
   answers it exactly like a missing target and records nothing.
4. Record missing elements as an assessment and request information. Do not silently reject a
   substantially compliant notice for failing to match Voucha's form wording.
5. To reject an email or ask the sender for more information, check who will receive the reply. An
   email with a parsed sender replies to that sender. An email with no parsed sender (a `failed`
   or `unparsed` parse) has nobody to reply to, so the reply field appears and a rejection queues no
   reply unless you type an address there. Type one only when the original MIME shows a sender
   worth answering; the server refuses an address for an email that has a parsed sender. The
   staff page then reports "A reply was queued." or "No reply sent."; the API returns
   `reply_queued`. Asking for more information (`response_kind: needs_information`) is API-only
   today and takes the same optional `reply_email`. A parse that lands after the decision sends nothing, and a repeated decision
   reports the original outcome.
6. While automatic provisional withholding is off, a clear-screened signed-in form waits here like
   a guest form. Accept it to withhold its targets, or reject it. The screen is advisory only.
7. If a signed-in case was provisionally restricted automatically, record a human `confirm`,
   `modify`, or `reverse` decision even when nobody appeals.

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

This switch is the intake kill switch. It stops only new claimant intake: the notice forms, staff
approval of an emailed notice (which would open a new case), the AI email-intake recommendation
job, and the AI form-screening job. Existing complaint pages, all ongoing statutory casework, and
designated-agent email ingest remain available; use the individual delivery/enforcement controls
and incident procedures rather than the intake switch to manage a downstream outage.

| Class             | Routes                                                                                                                                                                                      | While the switch is off |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| New intake        | `POST /api/v1/copyright-notices` (signed-in and guest form), `POST /api/v1/copyright-eu-notices`, `POST /api/v1/copyright-uk-notices`, `POST /api/v1/copyright-email-intakes/:id/approvals` | 503                     |
| In-case responses | Appeals, counter-notices, guest filings (supplement, withdrawal, court/CCB hold), EU and UK redress, EU supervised complaints                                                               | Open                    |
| Staff             | Every other staff decision, review, replay, capability, repeat-infringer, territorial-policy, and report route, including recording or rejecting a matched email reply                      | Open                    |

[`intake-kill-switch-routes.test.mts`](../../backend/api/v1/copyright-notices/intake-kill-switch-routes.test.mts)
fails when a non-GET copyright route has no class. Approving an emailed notice creates a new case,
so it is closed with the forms. Staff approval of an already received form intake is a staff
decision, so it can still open a case while the switch is off. New EU and UK notices need the
switch and an unwithdrawn territorial policy approval. Turning the switch on does not approve
either jurisdiction.

Designated-agent email is still ingested while the switch is off, so no inbound message waits
unseen in `copyright-incoming/`. The SES worker and its reconcile sweep copy each message into the
evidence bucket, parse it, link a reply to its
existing case, and list it in the staff email intake queue and the
[review-target page](#review-target-page). Both `S3_BUCKET_SES_INBOUND` and `S3_BUCKET_COPYRIGHT_EVIDENCE` must be
configured wherever mail is received, because ingest fails without them. A stack with no
`S3_BUCKET_SES_INBOUND` (local development) skips the five-minute reconcile instead, with a
`scheduled_job_config_missing` warning in Sentry, so in a deployed environment that warning means the
bucket is misconfigured. Only the AI recommendation job is paused, so no email contents reach a model. Ingest sends the sender nothing: there is no acknowledgement or automatic
reply. During a pause a sender receives mail only when staff act: the response staff choose when
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
the applicability review. Those contracts stay unavailable until an unwithdrawn territorial policy
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

- claimant abuse controls ([#1209](https://github.com/vouchington/vouchington/issues/1209)) are live;
- the GDPR Article 22 automated-decision disclosure
  ([#1230](https://github.com/vouchington/vouchington/issues/1230)) is published; and
- the staff queue has no clear-screened signed-in intake awaiting review, or staff accept that the
  sweeps withhold all of them without a moderator.

Enabling it releases the backlog. The agent-dispatch sweeps withhold every clear-screened signed-in
intake that lacks a moderator review, and the action reconciler enforces every pending
automated request. Each of those restrictions then needs its own human decision within the triage
target above.

Disabling it stops new automated assessments. Pending automated requests stay unenforced and in the
staff queue until a moderator decides the intake. Existing restrictions stay in place; review them
as usual.

## Counter-notice and hold handling

1. Keep informal appeals separate from statutory counter-notices.
2. Assess the counter-notice without editing its receipt. A compliant assessment creates one durable
   deadline from the referenced submission's receipt time.
3. Promptly forward the complete counter-notice to the original claimant using the deterministic
   statutory template and persist the delivery intent.
4. Review all case correspondence before restoration and record the exact targets each filing
   covers. Restoration of the whole case stays refused while any admitted court or CCB filing has
   no assessment. A threat, unrelated filing, different claimant, different material, non-commenced
   matter, or CCB filing outside the qualifying claim and counterclaim categories is not a hold.
5. Resolve a hold only with an immutable resolution record and staff rationale.

## Repeat-infringer review

1. A second operative incident opens a review. Opening the review does not suspend the account.
2. Reviewers may record warning or no action, or mark an incident withdrawn, duplicate, or abusive.
   Each decision needs a rationale. The rationale is stored encrypted.
3. Only an administrator may restrict or terminate, and only while two operative incidents remain.
   Both actions use the existing account suspension. Termination refuses unsuspend until an
   administrator records reinstatement. Reinstatement does not unsuspend the account. Do that from
   the user admin panel after the reinstatement row exists. The decision, any new suspension,
   moderator action, and publication invalidation work commit together after the account lifecycle
   lock; a failed decision leaves the review open for retry.
4. Account deletion returns 409 while an operative incident remains, or while an unresolved
   qualifying legal hold covers a placement that account owns. An open review alone does not refuse
   deletion.
5. Retention durations are still an approved-policy gate. Do not invent a clock in the product.

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
  `reviewTargetMinutes`. It uses the queue's own items, so the page and the queue agree:
  - a form intake awaiting review, an appeal or counter-notice with no moderator review, or a court
    or CCB filing awaiting assessment or resolution, timed from receipt;
  - an active restriction with no human review, timed from when it was imposed;
  - a failed media action or failed or bounced delivery, timed from the failure; and
  - an enforcement request that has not completed, timed from its creation.

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
with the decision. It also has no parsed sender, so rejecting it queues no reply unless you type
one (see [Queue triage](#queue-triage)). An email is `unparsed` for a moment while the SES worker runs. One that stays
`unparsed` for more than a few minutes means the worker keeps failing before it records a parse,
or copyright intake was switched off mid-flight: check the worker's errors. Treat a missed
restoration deadline under [Incident response](#incident-response).

The Sentry alert rule that routes this warning and its on-call destination are not in this
repository and are not set up yet ([#1230](https://github.com/vouchington/vouchington/issues/1230)).
Until they exist, the warning appears only as a Sentry issue. The job has no throttle beyond its
five-minute schedule, so a breach repeats every sweep until it clears.

A qualifying court or CCB hold blocks the restore but does not cancel or resolve the deadline. A
deadline held open that way keeps paging as a missed restoration deadline. Only a completed restore
or a superseding assessment clears it.

## Urgent review

Urgent work has no per-case alert rows or acknowledgements. Two mechanisms surface it:

- queue urgency: the staff case queue lists missed restoration deadlines first, then deadlines past
  escalation, then other open work (see [Queue triage](#queue-triage)); and
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
   to the parsed sender (or to an address staff type when none was parsed). Record a disposition
   only after counsel says whether that reply may go out.
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
5. **Preservation.** The product has no preservation hold for a subpoena. The legal holds in
   `copyright_notice_legal_hold_assessments` record only §512(g)(2)(C) court and CCB filings, and
   they change restoration. Never record a subpoena as a court or CCB filing, or as a submission
   of kind `court_or_ccb_hold`.
   - Copyright case records are append-only, and nothing in the product destroys case evidence.
     Retention deletion is not built yet, so nothing is deleted today; a switched-off deletion sweep
     is tracked in [#1101](https://github.com/vouchington/vouchington/issues/1101) (see
     [evidence retention](../requirements/moderation/COPYRIGHT-NOTICES.md#evidence-retention)).
   - Account records are not protected. The user or an administrator can delete the account at any
     time. [Account deletion](../requirements/users/ACCOUNT-DELETION-DATA-REQUEST.md) scrubs direct
     personal data immediately and reattributes the account's posts to `[deleted]`, so the case no
     longer links to the account. Only an operative repeat-infringer incident or an unresolved
     qualifying court or CCB hold blocks deletion; a subpoena does not.

   If counsel directs preservation, an administrator requests an
   [account data export](../requirements/users/ACCOUNT-DATA-EXPORT.md) for the account and saves
   the download to the matter file before its link expires. The export omits session IP
   addresses, so capture any that counsel needs from `user_sessions`. The account holder can see
   this export: their data page shows the latest request, whoever made it, along with its status
   and download link, and blocks the account holder's own request while it runs. Counsel decides
   whether to request the export together with the user-notice decision in step 4.

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
