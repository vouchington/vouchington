import app from '../api/app.mts'
import { settleUsageOnClose } from '../api/usage-meter-helpers.mts'
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
