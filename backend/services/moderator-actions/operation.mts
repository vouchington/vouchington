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
  } catch (error) {
    // Do not persist arbitrary provider errors: they can include credentials or private payloads.
    await recordModeratorAction(actorId, {
      ...input,
      operationRequestId,
      metadata: { phase: 'finished', outcome: 'failed' },
    })
    throw error
  }
  // Keep outcome persistence outside the catch: a logging failure is not an execution failure.
  await recordModeratorAction(actorId, {
    ...input,
    operationRequestId,
    metadata: { ...summarize?.(result), phase: 'finished', outcome: 'succeeded' },
  })
  return result
}
