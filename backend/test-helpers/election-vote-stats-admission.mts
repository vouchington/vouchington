import { completeOwnedElectionAdmissions } from './election-vote-stats-admission-results.mts'
import type { Job } from 'glide-mq'
import { onTestFinished } from 'vitest'
import { observeOwnedElectionQueue } from './election-vote-stats-observer-source.mts'
import { createElectionInstrumentation } from './election-vote-stats-instrumentation.mts'
let active = false

/** Retain original call-through logical duties; terminal transport follows the actual queue binding. */
export async function runWithOwnedPostElectionVoteStats(
  prepare: () => Promise<{
    targets: { lowScoreId: string; highScoreId: string }
    actions: Array<() => Promise<unknown>>
  }>,
) {
  if (active) throw new Error('Overlapping owned election observation')
  active = true
  const deadline = AbortSignal.timeout(25_000)
  let entity: ReturnType<typeof observeOwnedElectionQueue> | undefined
  let election: ReturnType<typeof observeOwnedElectionQueue> | undefined
  let instrumentation: ReturnType<typeof createElectionInstrumentation> | undefined
  let closing: Promise<void> | undefined
  const assertOpen = () => {
    if (closing) throw new Error('Owned election scope is closing')
  }
  const operation = Promise.resolve().then(async () => {
    assertOpen()
    const retry = await import('../data-stores/valkey-glide-mq/glide-mq-retry.mts')
    const statsQueue = (await import('../queues/vote-aggregation/queues.mts')).voteAggregation
    const entityQueue = (await import('../queues/entity-listeners/queues.mts')).entitiesListeners
    assertOpen()
    entity = observeOwnedElectionQueue(entityQueue)
    election = observeOwnedElectionQueue(statsQueue)
    await settleAll([entity.ready(), election.ready()])
    assertOpen()
    instrumentation = createElectionInstrumentation(entityQueue, statsQueue, retry)
    instrumentation.install()
    const ready = await prepare()
    return completeOwnedElectionAdmissions(ready, instrumentation, wait, () => {
      assertOpen()
    })
  })
  void operation.catch(retainRejection)
  const close = () => (closing ??= dispose())
  try {
    onTestFinished(close)
  } catch (err) {
    const results = await Promise.allSettled([close()])
    if (results[0]?.status === 'rejected')
      throw new AggregateError(
        [err, results[0].reason],
        'Election registration and cleanup failed',
        { cause: err },
      )
    throw err
  }
  const [result] = await Promise.allSettled([operation])
  const [cleanup] = await Promise.allSettled([close()])
  const errors = result?.status === 'rejected' ? [result.reason] : []
  if (cleanup?.status === 'rejected') errors.push(cleanup.reason)
  if (errors.length === 1) throw errors[0]
  if (errors.length)
    throw new AggregateError(errors, 'Election operation and cleanup failed', { cause: errors[0] })
  if (result?.status !== 'fulfilled') throw new Error('Missing election result')
  return result.value

  async function wait(kind: 'entity' | 'election', id: string) {
    const observer = kind === 'entity' ? entity! : election!
    const timeout = Promise.withResolvers<never>()
    const abort = () => timeout.reject(new Error(`Timed out observing owned ${kind} job ${id}`))
    deadline.addEventListener('abort', abort, { once: true })
    if (deadline.aborted) abort()
    try {
      const end = await Promise.race([observer.wait(id), timeout.promise])
      if (end.failed)
        throw new Error(`Owned ${kind} job ${id} failed`, {
          cause: Object.hasOwn(end, 'failureCause') ? end.failureCause : end.failedReason,
        })
      return end
    } finally {
      deadline.removeEventListener('abort', abort)
    }
  }
  async function dispose() {
    // Test timeout doesn't cancel producers: settle the full operation before unhooking.
    await Promise.allSettled([operation])
    const errors = (await instrumentation?.drain()) ?? []
    const attempt = async (run: () => unknown) => {
      try {
        await run()
      } catch (err) {
        errors.push(err)
      }
    }
    // Growing inventories retain every returned native identity, including late processor retries.
    let entityCursor = 0
    let admissionCursor = 0
    do {
      for (; entityCursor < (instrumentation?.entityJobs.length ?? 0); entityCursor++) {
        const item = instrumentation!.entityJobs[entityCursor]!
        const [settled] = await Promise.allSettled([item.job])
        if (settled?.status === 'fulfilled' && settled.value)
          await attempt(() => wait('entity', settled.value!.id))
      }
      for (; admissionCursor < (instrumentation?.admissions.length ?? 0); admissionCursor++) {
        const item = instrumentation!.admissions[admissionCursor]!
        const [settled] = await Promise.allSettled([item.jobs])
        if (settled?.status === 'fulfilled' && Array.isArray(settled.value)) {
          for (const job of settled.value as Job[]) {
            if (!job?.id) {
              errors.push(new Error('Owned result has no concrete job ID'))
              continue
            }
            await attempt(() => wait('election', job.id))
          }
        }
      }
      errors.push(...((await instrumentation?.drain()) ?? []))
    } while (
      entityCursor < (instrumentation?.entityJobs.length ?? 0) ||
      admissionCursor < (instrumentation?.admissions.length ?? 0)
    )
    errors.push(...(instrumentation?.restore() ?? []))
    await attempt(() => entity?.close())
    await attempt(() => election?.close())
    active = false
    if (errors.length)
      throw new AggregateError(errors, 'Owned election cleanup failed', { cause: errors[0] })
  }
}
async function settleAll(promises: Promise<unknown>[]) {
  const results = await Promise.allSettled(promises)
  const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length)
    throw new AggregateError(errors, 'Owned admissions failed', { cause: errors[0] })
}
function retainRejection(error: unknown) {
  return error
}
