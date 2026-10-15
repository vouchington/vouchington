import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { settleUsage, type UsageSettlement } from '@services/route-rate-limits'

export type UsageMeterSettings = Omit<UsageSettlement, 'statusCode' | 'durationMs'>
export type ResponseUsageSettlement = {
  readonly pathname: string
  readonly ownerUserId: string | null
  readonly completion: Promise<PromiseSettledResult<void>>
  readonly observerErrors: readonly unknown[]
}

type SettlementListener = (event: ResponseUsageSettlement) => undefined
const settlementListeners = new Set<SettlementListener>()

/** @public Observe request-owned settlement before response close; no request data is persisted. */
export function onResponseUsageSettlement(listener: SettlementListener): () => void {
  settlementListeners.add(listener)
  return () => {
    settlementListeners.delete(listener)
  }
}

// Charges the quota and emits analytics only after the final response status is known.
// A disconnect before headers settles without charging or reporting a usage event.
export function settleUsageOnClose(
  ctx: Context,
  settings: UsageMeterSettings,
  startedAt: number,
  resolveUnits?: () => 0 | 1 | undefined,
): ResponseUsageSettlement {
  const settled = Promise.withResolvers<PromiseSettledResult<void>>()
  const observerErrors: unknown[] = []
  const event: ResponseUsageSettlement = {
    pathname: new URL(ctx.req.url ?? '/', 'http://request.invalid').pathname,
    ownerUserId: settings.identity.credential === 'anonymous' ? null : settings.identity.userId,
    completion: settled.promise,
    observerErrors,
  }
  ctx.res.once('close', () => {
    void complete().then(
      () => settled.resolve({ status: 'fulfilled', value: undefined }),
      err => settled.resolve({ status: 'rejected', reason: err }),
    )
  })
  for (const listener of [...settlementListeners]) {
    try {
      listener(event)
    } catch (err) {
      observerErrors.push(err)
      try {
        onError(
          err instanceof Error
            ? err
            : new Error('Usage settlement observer failed', { cause: err }),
        )
      } catch (err) {
        observerErrors.push(err)
      }
    }
  }
  return event

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
