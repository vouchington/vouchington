import { onTestFinished, vi } from 'vitest'
import { ENTITY_LISTENERS_DOMAIN } from '@queues/background/enqueues/entity-listeners-jobs'
import { entitiesListeners } from '@queues/entity-listeners/queues'
// Register the real processor and its test-context error handler once per module.
import './entity-listener-completion.mts'

type QueueAdd = ReturnType<typeof entitiesListeners.add>

/**
 * Observe new owned work; the backend test queue resolves add after that job finishes. `localName`
 * is the listener's local job name (`processUserUpdated`); the queue-wide name is namespaced.
 */
export async function withTestEntityListenerCompletion<T>(
  localName: string,
  entityId: string,
  action: () => Promise<T>,
  admission?: { beforeAdd: () => Promise<void>; release: () => void },
): Promise<T> {
  const jobName = `${ENTITY_LISTENERS_DOMAIN.domain}.${localName}`
  const originalAdd = entitiesListeners.add
  const add = (...args: Parameters<typeof originalAdd>): QueueAdd =>
    originalAdd.call(entitiesListeners, ...args)
  const matchingAdds: QueueAdd[] = []
  let actionPromise: Promise<T> | undefined
  let cleanupPromise: Promise<void> | undefined
  const restoreObservers: (() => void)[] = []

  function cleanup(): Promise<void> {
    cleanupPromise ??= (async () => {
      try {
        admission?.release()
        if (actionPromise) await Promise.allSettled([actionPromise])
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
    if (finalAttempts.filter(result => result.status === 'fulfilled').length !== 1) {
      throw new Error(`Expected one successful '${jobName}' admission for ${entityId}`)
    }
    return result
  } finally {
    await cleanup()
  }
}
