# Deployed Error Investigation

This public guide describes the safety boundary for investigating a deployed
error. Executable commands, account selection, resource identifiers, and
provider-specific access procedures belong in the private `vouchington-infra`
operator runbooks.

## Staging post-deployment audit

Confirm the intended environment and a separate version/completion timestamp
for every independently deployed component. A failed, cancelled, or skipped
component is undeployed; compare it with its last confirmed deployment.
Compare bounded windows immediately before and after each deployment. Empty
post-deployment windows are inconclusive, not healthy.

An authorized operator may use the private runbook to inspect alarms,
application logs, error monitoring, and dead-letter queue counts. Keep that
inspection read-only: report only component, deployment version, time window,
count, and redacted event class. Do not print or persist payloads, receipt
handles, tokens, account identifiers, or resource names. Never acknowledge,
delete, redrive, or purge queue messages during diagnosis.

Error monitoring is optional. Missing or invalid monitoring configuration
disables telemetry without blocking the application; investigate through the
remaining approved signals. Stop on denied access, an environment mismatch, or
an action that would mutate data or infrastructure.

## Escalation

Escalate a confirmed regression with bounded, redacted evidence and the last
known-good deployment. Production diagnosis requires separate explicit
authorization. Follow the [CI transient retry policy](../development/ci.md#classifying-transient-infrastructure-failures)
for a classified transport failure; do not alter application or retry policy
from one timeout.

## Related references

- [Error handling](../overview/architecture/error-handling.md)
- [Bedrock batch DLQ handling](bedrock-batch-dlq-purge.md)
- [Valkey memory recovery](valkey-memory-recovery.md)
