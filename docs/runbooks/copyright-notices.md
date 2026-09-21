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
   accepting the case.
3. Confirm the target is an exact Voucha-hosted placement and preserve its captured revision.
4. Record missing elements as an assessment and request information. Do not silently reject a
   substantially compliant notice for failing to match Voucha's form wording.
5. If a signed-in case was provisionally restricted automatically, record a human `confirm`,
   `modify`, or `reverse` decision even when nobody appeals.

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

- provisional restrictions without a final human review, ordered by oldest restriction;
- open deadlines at or past `escalation_at`;
- open deadlines at or past `restoration_deadline_at` as incidents;
- incomplete action intents whose expected placement revision still matches;
- action intents rejected because the placement changed;
- undelivered correspondence, bounces, and exhausted delivery retries; and
- agent/parser failures routed to staff rather than accepted automatically.

For a pending restore intent, re-run the copyright eligibility transaction. Do not manually mark it
complete. The transaction must take the shared placement lock and recheck every copyright restriction
and target-specific hold. The media worker separately owns the atomic authoritative check of every
non-copyright blocker before delivery changes. If the placement revision changed, abandon the stale
intent through the domain recovery path and create no replacement until staff confirms the new
placement is within the case.

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
