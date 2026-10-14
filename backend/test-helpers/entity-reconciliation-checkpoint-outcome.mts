type CheckpointOutcome<Result> = { ok: true; value: Result } | { ok: false; error: unknown }

/** Each cleanup entry represents a failed operation, even when raw reasons are identical. */
export function finishEntityReconciliationCheckpoint<Result>(
  outcome: CheckpointOutcome<Result>,
  cleanupErrors: readonly unknown[],
): Result {
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'Entity reconciliation checkpoint reservation failed', {
      cause: outcome.ok ? cleanupErrors[0] : outcome.error,
    })
  }
  if (!outcome.ok) throw outcome.error
  return outcome.value
}
