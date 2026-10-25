import { AsyncLocalStorage } from 'node:async_hooks'
import { onEnqueueAdmission, type EnqueueAdmission } from '@vouchington/worker-runtime/glide-mq'
import { getPostByAny } from '../services/posts/get.mts'
import { getSharedBackgroundWorker } from '../../test-helpers/shared-background-worker.mts'
import onError from '@modules/on-error'
import {
  createEntityListenerLifetime,
  createEntityListenerErrorLedger,
  observeEntityListenerWork,
  waitForEntityListenerTerminal,
} from './entity-listener-terminal-wait.mts'

import {
  entityListenerInputId,
  isEntityListenerAdmission,
  rejectEntityListenerReason,
  recordMissingEntityTargets,
  observeEntityListenerTerminals,
  retainEntityListenerJobs,
  type EntityListenerTarget,
} from './entity-listener-admissions.mts'

// Entity listeners run on the fork's shared `background` worker, started without its normal runtime
// bootstrap; attach the error handler once so an 'error' event cannot crash the process.
const entityWorker = getSharedBackgroundWorker()
if (entityWorker.listenerCount('error') === 0) entityWorker.on('error', onError)

/** Own real factory promises and exact terminal IDs; never inspect queue history or infer isDrained. */
export async function withEntityListenerCompletion<T>(
  targets: readonly EntityListenerTarget[],
  action: () => Promise<T>,
  options: { release?: () => unknown; restore?: () => unknown } = {},
): Promise<T> {
  const context = new AsyncLocalStorage<symbol>()
  const token = Symbol('entity-listener-action')
  const lifetime = createEntityListenerLifetime()
  const deadline = lifetime.signal
  const expected = targets.map(target => ({ ...target }))
  const admissions: { event: EnqueueAdmission; direct: boolean }[] = []
  const { errors, takeCleanupErrors, attempt } = createEntityListenerErrorLedger()
  const physical = new Set<string>()
  const observed = new Set<string>()
  const receipts = new Set<string>()
  const waited = new Set<string>()
  let observer: ReturnType<typeof observeEntityListenerTerminals> | undefined
  let actionSettlement: Promise<PromiseSettledResult<T>[]> | undefined
  let prepared: Promise<void> | undefined
  let offAdmission = () => {}
  let closed = false
  let cleanup: Promise<void> | undefined
  const owns = (event: EnqueueAdmission) =>
    isEntityListenerAdmission(event) &&
    expected.some(
      target =>
        target.entityId &&
        event.inputs.some(input => entityListenerInputId(input) === target.entityId),
    )
  const finish = () =>
    (cleanup ??= (async () => {
      closed = true
      await attempt(() => options.release?.())
      if (prepared) await attempt(() => observeEntityListenerWork(prepared!, deadline))
      if (actionSettlement) {
        let settled = false
        await attempt(async () => {
          await observeEntityListenerWork(actionSettlement!, deadline)
          settled = true
        })
        if (settled)
          await attempt(async () => {
            for (const target of expected) {
              if (target.entityId || !target.postSlug) continue
              const post = await observeEntityListenerWork(getPostByAny(target.postSlug), deadline)
              if (post) target.entityId = post.id
            }
          })
      }
      const consumed = new Set<EnqueueAdmission>()
      for (;;) {
        const batch = admissions.filter(
          ({ event, direct }) => !consumed.has(event) && (direct || owns(event)),
        )
        for (const { event } of batch) {
          consumed.add(event)
          const [outcome] = await Promise.allSettled([
            observeEntityListenerWork(event.completion, deadline),
          ])
          if (outcome!.status === 'rejected') errors.push(outcome!.reason)
          else if (isEntityListenerAdmission(event))
            retainEntityListenerJobs(event, outcome!.value, physical, observed, receipts, errors)
          errors.push(...event.observerErrors, ...event.reportingErrors)
        }
        const ids = [...physical].filter(id => !waited.has(id))
        for (const id of ids) waited.add(id)
        const terminalObserver = observer
        const terminals = await Promise.allSettled(
          ids.map(id => waitForEntityListenerTerminal(terminalObserver!, id, deadline)),
        )
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
      await attempt(() => observer?.close())
    })())
  lifetime.register(async () => {
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
    offAdmission = onEnqueueAdmission(event => {
      const direct = context.getStore() === token
      if (
        direct ||
        (isEntityListenerAdmission(event) &&
          (owns(event) || expected.some(target => target.postSlug && !target.entityId)))
      )
        admissions.push({ event, direct })
      return undefined
    })
    prepared = observer.ready()
    await observeEntityListenerWork(prepared, deadline)
    if (closed) throw new Error('Entity listener owner closed before action')
    const operation = context.run(token, () =>
      Promise.resolve().then(() => {
        if (closed) throw new Error('Entity listener action started after teardown')
        return action()
      }),
    )
    actionSettlement = Promise.allSettled([operation])
    result = await observeEntityListenerWork(operation, deadline)
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
