import onError from '@modules/on-error'
import { recordModeratorAction, type RecordModeratorActionInput } from './record.mts'

/** Persist intent before an external side effect; a missing outcome remains visibly unresolved. */
export async function recordStaffOperation<T>(
  actorId: string,
  input: RecordModeratorActionInput,
  execute: () => Promise<T>,
  summarize?: (result: T) => Record<string, unknown>,
): Promise<T> {
  const operationRequestId = await recordModeratorAction(actorId, {
    ...input,
    metadata: { ...input.metadata, phase: 'requested' },
  })
  let result: T
  try {
    result = await execute()
  } catch (err) {
    // Do not persist arbitrary provider errors: they can include credentials or private payloads.
    await recordOutcome(actorId, input, operationRequestId, 'failed')
    throw err
  }
  await recordOutcome(
    actorId,
    input,
    operationRequestId,
    'succeeded',
    () => summarize?.(result) ?? {},
  )
  return result
}

async function recordOutcome(
  actorId: string,
  input: RecordModeratorActionInput,
  operationRequestId: string,
  outcome: 'failed' | 'succeeded',
  summarize?: () => Record<string, unknown>,
): Promise<void> {
  try {
    await recordModeratorAction(actorId, {
      ...input,
      operationRequestId,
      metadata: { ...summarize?.(), phase: 'finished', outcome },
    })
  } catch (err) {
    // Execution is already settled. Retain its result and the unresolved durable intent.
    try {
      onError(new Error('Staff operation outcome could not be recorded', { cause: err }))
    } catch {
      // Telemetry failure must not change the external operation's response either.
    }
  }
}
