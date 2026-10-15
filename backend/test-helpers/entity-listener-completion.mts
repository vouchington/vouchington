import { AsyncLocalStorage } from 'node:async_hooks'
import { onTestFinished } from 'vitest'
import {
  onEnqueueAdmission,
  type EnqueueAdmission,
} from '../data-stores/valkey-glide-mq/glide-mq-admission.mts'
import {
  onPostCommitCompletion,
  type PostCommitCompletion,
} from '../services/posts/post-commit-completion.mts'
import { entitiesListeners } from '../queues/entity-listeners/queues.mts'
import { QUEUE_NAME } from '../queues/entity-listeners/config.mts'
import { entitiesListeners as entityWorker } from '../workers/entity-listeners/workers.mts'
import onError from '@modules/on-error'

import {
  entityListenerInputId,
  rejectEntityListenerReason,
  recordMissingEntityTargets,
  observeEntityListenerTerminals,
  retainEntityListenerJobs,
  type EntityListenerTarget,
} from './entity-listener-admissions.mts'

// These fixtures import the canonical worker without its normal runtime bootstrap.
entityWorker.on('error', onError)

/** Own real factory promises and exact terminal IDs; never inspect queue history or infer isDrained. */
export async function withEntityListenerCompletion<T>(
  targets: readonly EntityListenerTarget[],
  action: () => Promise<T>,
  options: { release?: () => unknown; restore?: () => unknown } = {},
): Promise<T> {
  const context = new AsyncLocalStorage<symbol>()
  const token = Symbol('entity-listener-action')
  const expected = targets.map(target => ({ ...target }))
  const admissions: { event: EnqueueAdmission; direct: boolean }[] = []
  const posts: PostCommitCompletion[] = []
  const errors: unknown[] = []
  let cleanupReported = false
  const takeCleanupErrors = () => {
    if (cleanupReported) return []
    cleanupReported = true
    return [...errors]
  }
  const physical = new Set<string>()
  const observed = new Set<string>()
  const receipts = new Set<string>()
  const waited = new Set<string>()
  let observer: ReturnType<typeof observeEntityListenerTerminals> | undefined
  let actionSettlement: Promise<PromiseSettledResult<T>[]> | undefined
  let prepared: Promise<void> | undefined
  let offAdmission = () => {}
  let offPost = () => {}
  let closed = false
  let cleanup: Promise<void> | undefined
  const owns = (event: EnqueueAdmission) =>
    event.queue === entitiesListeners &&
    event.queueName === QUEUE_NAME &&
    expected.some(
      target =>
        target.entityId &&
        event.inputs.some(input => entityListenerInputId(input) === target.entityId),
    )
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
      await attempt(() => options.release?.())
      if (prepared) await Promise.allSettled([prepared])
      if (actionSettlement) await actionSettlement
      let postCursor = 0
      const consumed = new Set<EnqueueAdmission>()
      for (;;) {
        while (postCursor < posts.length) {
          const post = posts[postCursor++]!
          const [outcome] = await Promise.allSettled([post.completion])
          if (outcome!.status === 'rejected') errors.push(outcome!.reason)
          else
            errors.push(
              ...outcome!.value.operations.flatMap(result =>
                result.status === 'rejected' ? [result.reason] : [],
              ),
              ...outcome!.value.observerErrors,
              ...outcome!.value.reportingErrors,
            )
        }
        const batch = admissions.filter(
          ({ event, direct }) => !consumed.has(event) && (direct || owns(event)),
        )
        for (const { event } of batch) {
          consumed.add(event)
          const [outcome] = await Promise.allSettled([event.completion])
          if (outcome!.status === 'rejected') errors.push(outcome!.reason)
          else if (event.queue === entitiesListeners && event.queueName === QUEUE_NAME)
            retainEntityListenerJobs(event, outcome!.value, physical, observed, receipts, errors)
          errors.push(...event.observerErrors, ...event.reportingErrors)
        }
        const ids = [...physical].filter(id => !waited.has(id))
        for (const id of ids) waited.add(id)
        const terminalObserver = observer
        const terminals = await Promise.allSettled(ids.map(id => terminalObserver!.wait(id)))
        for (const terminal of terminals) {
          if (terminal.status === 'rejected') errors.push(terminal.reason)
          else if (terminal.value.failed)
            errors.push(
              Object.hasOwn(terminal.value, 'failureCause')
                ? terminal.value.failureCause
                : new Error(terminal.value.failedReason ?? 'Owned entity listener failed'),
            )
        }
        if (
          postCursor === posts.length &&
          !admissions.some(
            ({ event, direct }) => !consumed.has(event) && (direct || owns(event)),
          ) &&
          ![...physical].some(id => !waited.has(id))
        )
          break
      }
      recordMissingEntityTargets(expected, observed, errors)
      await attempt(() => options.restore?.())
      await attempt(offAdmission)
      await attempt(offPost)
      await attempt(() => observer?.close())
    })())
  onTestFinished(async () => {
    await finish()
    const unreported = takeCleanupErrors()
    if (unreported.length)
      throw new AggregateError(unreported, 'Entity listener owner teardown failed', {
        cause: unreported[0],
      })
  })
  let failed = false
  let primary: unknown
  let result: T | undefined
  try {
    observer = observeEntityListenerTerminals()
    offPost = onPostCommitCompletion(event => {
      if (
        expected.some(
          target =>
            target.entityId === event.postId || (target.postSlug && target.postSlug === event.slug),
        )
      ) {
        for (const target of expected)
          if (target.postSlug === event.slug) target.entityId = event.postId
        posts.push(event)
      }
      return undefined
    })
    offAdmission = onEnqueueAdmission(event => {
      const direct = context.getStore() === token
      if (
        direct ||
        (event.queue === entitiesListeners &&
          (owns(event) || expected.some(target => target.postSlug && !target.entityId)))
      )
        admissions.push({ event, direct })
      return undefined
    })
    prepared = observer.ready()
    await prepared
    if (closed) throw new Error('Entity listener owner closed before action')
    const operation = context.run(token, () =>
      Promise.resolve().then(() => {
        if (closed) throw new Error('Entity listener action started after teardown')
        return action()
      }),
    )
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
        'Entity listener action or completion failed',
        { cause: failed ? primary : unreported[0] },
      ),
    )
  if (failed) return rejectEntityListenerReason<T>(primary)
  return result!
}
