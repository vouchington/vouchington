# Copyright Notice Operations

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
5. If a signed-in case was provisionally restricted automatically, record a human `confirm`,
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

Do not advertise EU or UK statutory intake until their distinct schemas, review rules, notices, and
any required representatives are deployed. The current public API accepts only `us_dmca`.

The application repository creates placement-bound URLs and durable PostgreSQL action intents, but
that is not complete CDN enforcement. Activation also requires the linked infrastructure change to
authorize every placement request at the viewer edge, deny direct origin access, retire historical
generic post-image routes, publish the authoritative delivery registry, and invalidate cached
placement paths after a state transition. Record cold and warm cache evidence for withhold and
restore before enabling intake.

## Counter-notice and hold handling

1. Keep informal appeals separate from statutory counter-notices.
2. Assess the counter-notice without editing its receipt. A compliant assessment creates one durable
   deadline from the referenced submission's receipt time.
3. Promptly forward the complete counter-notice to the original claimant using the deterministic
   statutory template and persist the delivery intent.
4. Review all case correspondence before restoration and record the exact targets each filing
   covers. A threat, unrelated filing, different claimant, different material, non-commenced matter,
   or CCB filing outside the qualifying claim and counterclaim categories is not a hold.
5. Resolve a hold only with an immutable resolution record and staff rationale.

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

For a cross-store failure, PostgreSQL remains the legal workflow record. Keep the application
projection fail-closed, replay the idempotent edge-registry publication, invalidate the exact
placement path, and verify both a cached and uncached request before acknowledging delivery. Never
change the PostgreSQL revision merely to make the edge registry match it.

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
