import { renewUserDeletionAttempt } from './lifecycle.mts'

const HEARTBEAT_INTERVAL_MS = 60_000

type UserDeletionHeartbeatOptions = {
  heartbeatIntervalMs?: number
  renewAttempt?: (requestId: string, processingAttemptId: string) => Promise<boolean>
}

export async function runWithUserDeletionAttemptHeartbeat<T>(
  requestId: string,
  processingAttemptId: string,
  operation: () => Promise<T>,
  options: UserDeletionHeartbeatOptions = {},
): Promise<T> {
  const renewAttempt = options.renewAttempt ?? renewUserDeletionAttempt
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS
  await assertUserDeletionAttemptOwnership(requestId, processingAttemptId, renewAttempt)

  let ownershipLost = false
  let heartbeatError: { reason: unknown } | undefined
  let heartbeat = Promise.resolve()
  const timer = setInterval(() => {
    heartbeat = heartbeat
      .then(async () => {
        if (!(await renewAttempt(requestId, processingAttemptId))) ownershipLost = true
        return undefined
      })
      .catch(error => {
        heartbeatError = { reason: error }
      })
  }, heartbeatIntervalMs)
  timer.unref()

  try {
    const result = await operation()
    await heartbeat
    if (heartbeatError) {
      const { reason } = heartbeatError
      throw reason instanceof Error
        ? reason
        : new Error('User deletion heartbeat failed', { cause: reason })
    }
    if (ownershipLost) throw new Error('User deletion attempt lost ownership during external work')
    await assertUserDeletionAttemptOwnership(requestId, processingAttemptId, renewAttempt)
    return result
  } finally {
    clearInterval(timer)
  }
}

async function assertUserDeletionAttemptOwnership(
  requestId: string,
  processingAttemptId: string,
  renewAttempt: (requestId: string, processingAttemptId: string) => Promise<boolean>,
): Promise<void> {
  if (!(await renewAttempt(requestId, processingAttemptId))) {
    throw new Error('User deletion attempt lost ownership before external work')
  }
}
