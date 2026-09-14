# Valkey Memory Recovery

This public guide defines the recovery decision boundary. Provider commands,
account access, replication topology, and exact resource names are maintained
in the private `vouchington-infra` operator runbook.

## Diagnose before changing anything

An authorized operator verifies the environment, memory pressure, eviction
behavior, client errors, and queue health over a bounded window. Distinguish
cache pressure from durable queue backlog; a transient increase alone is not
evidence that data may be removed.

## Recovery contract

- Preserve durable queue state; never use cache recovery to discard queued
  work.
- Prefer expiry, application-level invalidation, and the capacity actions in
  the private runbook over ad-hoc key deletion.
- Any key deletion, state reset, failover, or parameter change requires
  explicit authorization and a rollback plan.
- Verify client recovery and queue processing after each authorized change.

Record the environment, redacted symptom, approved action, verification
window, and rollback result. Do not publish provider identifiers, account
names, endpoint addresses, or operator credentials.
