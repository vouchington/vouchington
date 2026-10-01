import type { Context } from '@jongleberry/api-server'
import { settleUsage, type UsageSettlement } from '@services/route-rate-limits'

export type UsageMeterSettings = Omit<UsageSettlement, 'statusCode' | 'durationMs'>

// Charges the quota and emits the usage event when the response closes, because only then is the
// real status known: a 2xx or 4xx is charged, a 429 or an actual 5xx is not. A client that
// disconnects before any response header was sent has no status to charge or report, so it is
// skipped. Shared by every metered surface so they settle identically.
export function settleUsageOnClose(ctx: Context, settings: UsageMeterSettings, startedAt: number) {
  ctx.res.once('close', () => {
    if (!ctx.res.headersSent) return
    // settleUsage reports its own Valkey and analytics failures and never rejects.
    void settleUsage({
      ...settings,
      statusCode: ctx.res.statusCode,
      durationMs: performance.now() - startedAt,
    })
  })
}
