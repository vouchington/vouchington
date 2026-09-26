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
   the user admin panel after the reinstatement row exists.
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
worker's durable repair-marker reconciliation. It rechecks current exact-tuple authority before
publishing recovery; never manufacture an allow or manually advance a generation. See the
[media-delivery safety protocol](../../backend/services/media-delivery-safety/README.md) for the
publication fence, repair markers, and bounded reconciliation contract.

Before enabling copyright intake, audit any historical blocked restores whose qualifying hold lacks
restriction provenance. This read-only query identifies candidates; it cannot infer a safe binding,
because a later restriction on the same target may be unrelated to the hold. Counsel and the
moderation owner must review the case's lifecycle ledger and remediate it through the domain
workflow rather than writing a binding directly.

```sql
SELECT assessment.id AS assessment_id, submission.copyright_notice_id,
  assessment_target.copyright_notice_target_id, restriction.id AS restriction_id,
  intent.id AS restore_intent_id, resolution.id AS resolution_id
FROM copyright_notice_legal_hold_assessments assessment
JOIN copyright_notice_submissions submission
  ON submission.id = assessment.copyright_notice_submission_id
JOIN copyright_notice_legal_hold_assessment_targets assessment_target
  ON assessment_target.copyright_notice_legal_hold_assessment_id = assessment.id
JOIN copyright_restrictions restriction
  ON restriction.copyright_notice_target_id = assessment_target.copyright_notice_target_id
JOIN copyright_notice_action_intents intent
  ON intent.copyright_restriction_id = restriction.id
  AND intent.action = 'restore'
  AND intent.state = 'blocked'
LEFT JOIN copyright_legal_hold_restrictions binding
  ON binding.copyright_restriction_id = restriction.id
  AND binding.copyright_notice_legal_hold_assessment_id = assessment.id
LEFT JOIN copyright_notice_legal_hold_resolutions resolution
  ON resolution.copyright_notice_legal_hold_assessment_id = assessment.id
WHERE binding.copyright_restriction_id IS NULL
  AND assessment.from_original_claimant
  AND assessment.same_material
  AND assessment.proceeding_kind IS NOT NULL
  AND assessment.commenced_at IS NOT NULL
  AND assessment.received_by_designated_agent_at IS NOT NULL
  AND assessment.received_by_designated_agent_at <= assessment.assessed_at
ORDER BY assessment.id, intent.id;
```

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
