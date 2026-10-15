import { onTestFinished, vi } from 'vitest'
import * as userEnqueues from '@queues/entity-listeners/enqueues/users'
import { entitiesListeners } from '@queues/entity-listeners/queues'
// Register the real processor and its test-context error handler once per module.
import './entity-listener-completion.mts'

type QueueAdd = ReturnType<typeof entitiesListeners.add>

/** Observe new owned work; the backend test queue resolves add after that job finishes. */
export async function withTestEntityListenerCompletion<T>(
  jobName: string,
  entityId: string,
  action: () => Promise<T>,
  admission?: { beforeAdd: () => Promise<void>; release: () => void },
): Promise<T> {
  const originalAdd = entitiesListeners.add
  const add = (...args: Parameters<typeof originalAdd>): QueueAdd =>
    originalAdd.call(entitiesListeners, ...args)
  const matchingAdds: QueueAdd[] = []
  const enqueueUser = userEnqueues.enqueueOnUserUpdated
  const matchingEnqueues: ReturnType<typeof enqueueUser>[] = []
  let actionPromise: Promise<T> | undefined
  let cleanupPromise: Promise<void> | undefined
  const restoreObservers: (() => void)[] = []

  function cleanup(): Promise<void> {
    cleanupPromise ??= (async () => {
      try {
        admission?.release()
        if (actionPromise) await Promise.allSettled([actionPromise])
        await Promise.allSettled(matchingEnqueues)
        let drained = 0
        while (drained < matchingAdds.length) {
          const pending = matchingAdds.slice(drained)
          drained = matchingAdds.length
          await Promise.allSettled(pending)
        }
      } finally {
        for (const restore of restoreObservers.toReversed()) restore()
      }
    })()
    return cleanupPromise
  }
  onTestFinished(cleanup)

  try {
    const enqueueSpy = vi
      .spyOn(userEnqueues, 'enqueueOnUserUpdated')
      .mockImplementation((...args: Parameters<typeof enqueueUser>) => {
        const enqueued = enqueueUser(...args)
        if (jobName === 'processUserUpdated' && args[0] === entityId)
          matchingEnqueues.push(enqueued)
        return enqueued
      })
    restoreObservers.push(() => enqueueSpy.mockRestore())
    const spy = vi.spyOn(entitiesListeners, 'add').mockImplementation((name, data, options) => {
      const matches =
        name === jobName &&
        typeof data === 'object' &&
        data !== null &&
        'id' in data &&
        data.id === entityId
      const added = matches
        ? Promise.resolve()
            .then(() => admission?.beforeAdd())
            .then(() => add(name, data, options))
        : add(name, data, options)
      if (matches) {
        matchingAdds.push(added)
        void added.catch(() => undefined)
      }
      return added
    })
    restoreObservers.push(() => spy.mockRestore())

    actionPromise = Promise.resolve().then(action)
    const result = await actionPromise
    let settledEnqueues = 0
    while (settledEnqueues < matchingEnqueues.length) {
      const pending = matchingEnqueues.slice(settledEnqueues)
      settledEnqueues = matchingEnqueues.length
      await Promise.all(pending)
    }
    if (matchingEnqueues.length !== 1) {
      throw new Error(
        `Expected one '${jobName}' logical enqueue for ${entityId}, got ${matchingEnqueues.length}`,
      )
    }
    const attempts = await Promise.allSettled(matchingAdds)
    const successful = attempts.filter(result => result.status === 'fulfilled')
    if (successful.length !== 1)
      throw new Error(`Expected one successful '${jobName}' admission for ${entityId}`)
    const job = successful[0]!.value
    if (!job) throw new Error(`The '${jobName}' enqueue was deduplicated for ${entityId}`)
    if (
      job.name !== jobName ||
      typeof job.data !== 'object' ||
      job.data === null ||
      !('id' in job.data) ||
      job.data.id !== entityId
    ) {
      throw new Error(`Unexpected '${jobName}' job identity for ${entityId}`)
    }
    const state = await job.getState()
    if (state !== 'completed') throw new Error(`The '${jobName}' job ${job.id} ended as ${state}`)
    await cleanup()
    const finalAttempts = await Promise.allSettled(matchingAdds)
    if (
      matchingEnqueues.length !== 1 ||
      finalAttempts.filter(result => result.status === 'fulfilled').length !== 1
    ) {
      throw new Error(
        `Expected one '${jobName}' logical enqueue and successful admission for ${entityId}`,
      )
    }
    return result
  } finally {
    await cleanup()
  }
}
