import type { Context } from '@jongleberry/api-server'
import { settleUsage, type UsageSettlement } from '@services/route-rate-limits'

export type UsageMeterSettings = Omit<UsageSettlement, 'statusCode' | 'durationMs'>

// Charges the quota and emits analytics only after the final response status is known.
// A disconnect before headers settles without charging or reporting a usage event.
export function settleUsageOnClose(
  ctx: Context,
  settings: UsageMeterSettings,
  startedAt: number,
  resolveUnits?: () => 0 | 1 | undefined,
): void {
  ctx.res.once('close', () => {
    void complete().catch(consumeClosedResponseUsageFailure)
  })

  async function complete(): Promise<void> {
    if (!ctx.res.headersSent) return
    await settleUsage({
      ...settings,
      statusCode: ctx.res.statusCode,
      durationMs: performance.now() - startedAt,
      units: resolveUnits?.(),
    })
  }
}

// The response is already closed; preserve consumption without adding another error reporter.
function consumeClosedResponseUsageFailure(): undefined {
  return undefined
}
