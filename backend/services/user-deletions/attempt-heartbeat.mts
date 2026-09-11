import { renewUserDeletionAttempt } from './lifecycle.mts'

const HEARTBEAT_INTERVAL_MS = 60_000

export async function runWithUserDeletionAttemptHeartbeat<T>(
  requestId: string,
  processingAttemptId: string,
  operation: () => Promise<T>,
): Promise<T> {
  await assertUserDeletionAttemptOwnership(requestId, processingAttemptId)

  let ownershipLost = false
  let heartbeatError: unknown
  let heartbeat = Promise.resolve()
  const timer = setInterval(() => {
    heartbeat = heartbeat
      .then(async () => {
        if (!(await renewUserDeletionAttempt(requestId, processingAttemptId))) ownershipLost = true
        return undefined
      })
      .catch(error => {
        heartbeatError = error
      })
  }, HEARTBEAT_INTERVAL_MS)
  timer.unref()

  try {
    const result = await operation()
    await heartbeat
    if (heartbeatError) throw heartbeatError
    if (ownershipLost) throw new Error('User deletion attempt lost ownership during external work')
    await assertUserDeletionAttemptOwnership(requestId, processingAttemptId)
    return result
  } finally {
    clearInterval(timer)
  }
}

async function assertUserDeletionAttemptOwnership(
  requestId: string,
  processingAttemptId: string,
): Promise<void> {
  if (!(await renewUserDeletionAttempt(requestId, processingAttemptId))) {
    throw new Error('User deletion attempt lost ownership before external work')
  }
}
