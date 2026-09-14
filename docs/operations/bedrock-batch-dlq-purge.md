# Bedrock Batch Dead-Letter Queue Handling

This public document records the safety contract for dead-letter queue
handling. Queue URLs, cloud commands, and operator access steps live in the
private `vouchington-infra` runbook.

## Triage and recovery

Use authorized read-only inspection to establish queue depth and classify
redacted failure categories. Never expose message bodies, receipt handles,
input documents, account identifiers, or object locations in public records.

- Do not purge, delete, or redrive while the failure cause is unknown.
- Confirm producer, consumer, and provider health before replaying a bounded
  set of messages.
- A destructive action requires explicit authorization, a bounded target, and
  a verification/rollback path in the private operator runbook.

Record only environment, deployment interval, count, and redacted failure
class in the public incident record.
