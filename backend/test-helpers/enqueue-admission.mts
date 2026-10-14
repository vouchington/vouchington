import { onTestFinished } from 'vitest'
import { createQueue } from '../data-stores/valkey-glide-mq/glide-mq-factory.mts'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'

/** Own a unique real factory queue; never replace its producer or inspect SDK registries. */
export async function withEnqueueAdmissionQueue<T>(
  action: (
    queue: ReturnType<typeof createQueue>,
    events: readonly EnqueueAdmission[],
    restore: (cleanup: () => void) => void,
    release: (cleanup: () => void) => void,
  ) => Promise<T>,
): Promise<T> {
  const events: EnqueueAdmission[] = []
  const restorers: (() => void)[] = []
  const releasers: (() => void)[] = []
  const errors: unknown[] = []
  let cleanupReported = false
  const takeCleanupErrors = () => {
    if (cleanupReported) return []
    cleanupReported = true
    return [...errors]
  }
  let queue: ReturnType<typeof createQueue> | undefined
  let actionSettlement: Promise<PromiseSettledResult<T>[]> | undefined
  let off = () => {}
  let closed = false
  let cleanup: Promise<void> | undefined
  const attempt = async (operation: () => unknown) => {
    try {
      await operation()
    } catch (err) {
      errors.push(err)
    }
  }
  const finish = () =>
    (cleanup ??= (async () => {
      closed = true
      for (const release of releasers.toReversed()) await attempt(release)
      if (actionSettlement) await actionSettlement
      for (const event of events) await Promise.allSettled([event.completion])
      for (const restore of restorers.toReversed()) await attempt(restore)
      if (queue) {
        await attempt(() => queue!.obliterate({ force: false }))
        await attempt(() => queue!.close())
      }
      await attempt(off)
    })())
  onTestFinished(async () => {
    await finish()
    const unreported = takeCleanupErrors()
    if (unreported.length)
      throw new AggregateError(unreported, 'Admission queue teardown failed', {
        cause: unreported[0],
      })
  })
  let failed = false
  let primary: unknown
  let result: T | undefined
  try {
    queue = createQueue(`admission-${crypto.randomUUID()}`, { priorityKind: 'none' })
    off = onEnqueueAdmission(event => {
      if (event.queue === queue) events.push(event)
      return undefined
    })
    const operation = Promise.resolve().then(() => {
      if (closed) throw new Error('Admission queue owner is closed')
      return action(
        queue!,
        events,
        restore => restorers.push(restore),
        release => releasers.push(release),
      )
    })
    actionSettlement = Promise.allSettled([operation])
    result = await operation
  } catch (err) {
    failed = true
    primary = err
  } finally {
    await finish()
  }
  const unreported = takeCleanupErrors()
  if (unreported.length)
    return Promise.reject(
      new AggregateError(
        failed ? [primary, ...unreported] : unreported,
        'Admission queue action or teardown failed',
        { cause: failed ? primary : unreported[0] },
      ),
    )
  if (failed) {
    const rejection = Promise.withResolvers<T>()
    rejection.reject(primary)
    return rejection.promise
  }
  return result!
}
