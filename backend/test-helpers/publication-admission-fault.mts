import { vi } from 'vitest'
import { POST_PUBLICATION_EFFECTS_JOB } from '../queues/background/enqueues/post-publication-jobs.mts'
import { backgroundQueue } from './shared-background-queue.mts'
import { rejectQueueJobAddForTest } from './injected-queue-failures.mts'

/** Fault only owned native publication admissions; other queues/scopes still use real storage. */
export function rejectOwnedPublicationAdmission(
  scopeIds: readonly string[],
  error: Error,
): () => void {
  const owned = new Set(scopeIds)
  const matches = (name: string, data: unknown) => {
    const scope = (data as { scope?: { id?: unknown } } | null)?.scope
    return (
      name === POST_PUBLICATION_EFFECTS_JOB.name &&
      typeof scope?.id === 'string' &&
      owned.has(scope.id)
    )
  }
  const restoreAdd = rejectQueueJobAddForTest(backgroundQueue, matches, error)
  const realAddBulk = backgroundQueue.addBulk
  const bulkSpy = vi
    .spyOn(backgroundQueue, 'addBulk')
    .mockImplementation(jobs =>
      jobs.some(job => matches(job.name, job.data))
        ? Promise.reject(error)
        : Reflect.apply(realAddBulk, backgroundQueue, [jobs]),
    )
  return () => {
    bulkSpy.mockRestore()
    restoreAdd()
  }
}

/** Model native non-atomic bulk failure after the first owned job was stored. */
export function acceptOwnedPublicationPrefixThenReject(scopeId: string, error: Error): () => void {
  const realAddBulk = backgroundQueue.addBulk
  let rejected = false
  const bulkSpy = vi.spyOn(backgroundQueue, 'addBulk').mockImplementation(async jobs => {
    const owned = jobs.every(
      job =>
        job.name === POST_PUBLICATION_EFFECTS_JOB.name &&
        (job.data as { scope?: { id?: string } }).scope?.id === scopeId,
    )
    if (!rejected && owned && jobs.length > 1) {
      rejected = true
      await Reflect.apply(realAddBulk, backgroundQueue, [jobs.slice(0, 1)])
      throw error
    }
    return Reflect.apply(realAddBulk, backgroundQueue, [jobs])
  })
  return () => bulkSpy.mockRestore()
}
