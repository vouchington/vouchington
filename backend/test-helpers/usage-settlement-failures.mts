import { onTestFinished } from 'vitest'
import app from '../api/app.mts'
import {
  onResponseUsageSettlement,
  settleUsageOnClose,
  type ResponseUsageSettlement,
} from '../api/usage-meter-helpers.mts'
import { resolveUsagePlan, selectUsageQuota } from '../services/route-rate-limits/index.mts'

/** A real HTTP fixture for the public units resolver's failure outcome, not a mocked context. */
export function registerFailingUsageResolverRoute(base: string, failure: Error): void {
  app.route(base).get(async ctx => {
    // Unusual preamble: this fixture exercises settlement directly, without a second meter.
    const user = await ctx.getCurrentUser()
    if (!user) return ctx.throw(401, 'Unauthorized')
    const plan = resolveUsagePlan(user)
    const quota = selectUsageQuota({ surface: 'rest_user', plan, scopeClass: 'read' })
    settleUsageOnClose(
      ctx,
      {
        surface: 'rest_user',
        identity: { credential: 'session', userId: user.id },
        plan,
        scopeClass: 'read',
        quota,
      },
      performance.now(),
      () => {
        throw failure
      },
    )
    ctx.json({ ok: true })
  })
}

/** Expected settlement failures are data; unexpected action and teardown failures still reject. */
export async function withUsageSettlementFailureObservation<T>(
  userId: string,
  install: (restore: (cleanup: () => void) => void) => void,
  start: () => Promise<T>,
  verify: (result: T, events: readonly ResponseUsageSettlement[]) => Promise<void>,
): Promise<T> {
  const events: ResponseUsageSettlement[] = []
  const restorers: (() => void)[] = []
  const actions: { outcome: Promise<PromiseSettledResult<unknown>>; consumed: boolean }[] = []
  const errors: unknown[] = []
  let closed = false
  let cleanup: Promise<void> | undefined
  let off = () => {}
  async function run<R>(factory: () => Promise<R>): Promise<R> {
    if (closed) return Promise.reject(new Error('Usage failure owner is closed'))
    const action = Promise.resolve().then(() => {
      if (closed) throw new Error('Usage failure action started after teardown')
      return factory()
    })
    const record = {
      outcome: Promise.allSettled([action]).then(([outcome]) => outcome!),
      consumed: false,
    }
    actions.push(record)
    try {
      return await action
    } catch (err) {
      record.consumed = true
      const rejection = Promise.withResolvers<R>()
      rejection.reject(err)
      return rejection.promise
    }
  }
  const finish = () =>
    (cleanup ??= (async () => {
      closed = true
      for (const record of actions) {
        const outcome = await record.outcome
        if (outcome.status === 'rejected' && !record.consumed) errors.push(outcome.reason)
      }
      for (const event of events) {
        const [outcome] = await Promise.allSettled([event.completion])
        if (outcome!.status === 'rejected') errors.push(outcome!.reason)
      }
      try {
        off()
      } catch (err) {
        errors.push(err)
      }
      for (const restore of restorers.toReversed()) {
        try {
          restore()
        } catch (err) {
          errors.push(err)
        }
      }
    })())
  onTestFinished(async () => {
    await finish()
    if (errors.length)
      throw new AggregateError(errors, 'Usage failure teardown failed', { cause: errors[0] })
  })
  off = onResponseUsageSettlement(event => {
    if (event.ownerUserId === userId) events.push(event)
    return undefined
  })
  let failed = false
  let primary: unknown
  let result: T | undefined
  try {
    install(restore => restorers.push(restore))
    result = await run(start)
    await run(() => verify(result!, events))
  } catch (err) {
    failed = true
    primary = err
  } finally {
    await finish()
  }
  if (errors.length)
    return Promise.reject(
      new AggregateError(
        failed ? [primary, ...errors] : errors,
        'Usage failure action or teardown failed',
        { cause: failed ? primary : errors[0] },
      ),
    )
  if (failed) {
    const rejection = Promise.withResolvers<T>()
    rejection.reject(primary)
    return rejection.promise
  }
  return result!
}
