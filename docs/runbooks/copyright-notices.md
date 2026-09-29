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

1. Confirm the original submission and evidence digest exist. Never reconstruct a missing email from
   agent output.
2. For email, compare the structured extraction with the inert original and correct it before
   accepting the case. Verify each extracted declaration against its recorded source excerpt. If no
   recommendation exists, use the explicit manual-fallback reason; never silently bypass the agent.
3. Confirm the target is an exact Voucha-hosted placement and preserve its captured revision.
4. Record missing elements as an assessment and request information. Do not silently reject a
   substantially compliant notice for failing to match Voucha's form wording.
5. While automatic provisional withholding is off, a clear-screened signed-in form waits here like
   a guest form. Accept it to withhold its targets, or reject it. The screen is advisory only.
6. If a signed-in case was provisionally restricted automatically, record a human `confirm`,
   `modify`, or `reverse` decision even when nobody appeals.

## Intake activation

Keep `COPYRIGHT_INTAKE_ENABLED=false` until all of the following are verified in the target
environment:

This switch stops only new intake and intake-agent processing. Existing complaint pages and all
ongoing statutory casework remain available; use the individual delivery/enforcement controls and
incident procedures rather than the intake switch to manage a downstream outage.

- the published address belongs to the registered US designated agent and production inbox routing
  assigns `copyright` only to the trusted `copyright-incoming/` S3 prefix;
- `S3_BUCKET_COPYRIGHT_EVIDENCE` is private, encrypted, versioned, access-logged, retention-reviewed,
  and writable/readable only by the required workers and authorized evidence tooling;
- form Turnstile secrets, route rate limits, scheduled agent reconciliation, moderator queues, and
  urgent review alerts are live;
- reversible placement withholding and origin/CDN denial have passed end-to-end testing;
- receipts, poster notices, approved correspondence, retry/bounce handling, appeal and counter-notice
  workflows are live; and
- the repeat-infringer policy, retention schedule, templates, staffing, and legal review are approved.

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

## Staff alerts

Copyright staff alerts have no notification destination and no numeric review threshold in code.
They stay closed until an operator records an approved `copyright_staff_alert_policies` row. Do not
delete a delivery intent, deadline, or notice to clear an alert. Acknowledge the episode, or clear
the underlying fact through the normal case workflow.

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
