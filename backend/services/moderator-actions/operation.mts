import onError from '@modules/on-error'
import type { QueryExecutor } from '@data-stores/psql'
import { recordModeratorAction, type RecordModeratorActionInput } from './record.mts'

/** Persist intent before an external side effect; a missing outcome remains visibly unresolved. */
export async function recordStaffOperation<T>(
  actorId: string,
  input: RecordModeratorActionInput,
  execute: () => Promise<T>,
  summarize?: (result: T) => Record<string, unknown>,
  options: { query?: QueryExecutor } = {},
): Promise<T> {
  if (options.query && 'client' in options.query)
    throw new TypeError('Staff operation history writer must autocommit')
  const operationRequestId = await recordModeratorAction(
    actorId,
    {
      ...input,
      metadata: { ...input.metadata, phase: 'requested' },
    },
    options,
  )
  let result: T
  try {
    result = await execute()
  } catch (err) {
    // Do not persist arbitrary provider errors: they can include credentials or private payloads.
    await recordOutcome(actorId, input, operationRequestId, 'failed', undefined, options)
    throw err
  }
  await recordOutcome(
    actorId,
    input,
    operationRequestId,
    'succeeded',
    () => summarize?.(result) ?? {},
    options,
  )
  return result
}

async function recordOutcome(
  actorId: string,
  input: RecordModeratorActionInput,
  operationRequestId: string,
  outcome: 'failed' | 'succeeded',
  summarize?: () => Record<string, unknown>,
  options: { query?: QueryExecutor } = {},
): Promise<void> {
  try {
    await recordModeratorAction(
      actorId,
      {
        ...input,
        operationRequestId,
        metadata: { ...summarize?.(), phase: 'finished', outcome },
      },
      options,
    )
  } catch (err) {
    // Execution is already settled. Retain its result and the unresolved durable intent.
    try {
      onError(new Error('Staff operation outcome could not be recorded', { cause: err }))
    } catch {
      // Telemetry failure must not change the external operation's response either.
    }
  }
}
