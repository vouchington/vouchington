import { onTestFinished, vi } from 'vitest'
import {
  clearDailyAiCostTotalCacheForTesting,
  getAccountingUncertaintyKey,
  openAiSpendCapConfig,
} from '../services/ai-usage/index.mts'
import { unlinkTestAiUsageUncertaintyKey } from './ai-usage-uncertainty-key.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'
import { acquireTestAiUsageDateReservation } from './entities/ai-usage-date-reservation.mts'

/**
 * Runs `fn` on a reserved, clean AI-usage day with the spend cap enabled at `dailyCapMicrounits`.
 * `Date` is faked into that day, so an ambiguous billed provider failure latches the reserved day
 * and never the real one. The day's latch is cleared afterwards because a far-future day would
 * otherwise keep it for the length of its TTL.
 */
export async function withReservedAiUsageDay<T>(
  dailyCapMicrounits: number,
  fn: (day: string) => Promise<T>,
): Promise<T> {
  await openAiSpendCapConfig.waitForInitialization()
  const reservation = await acquireTestAiUsageDateReservation()
  let released = false
  const release = async () => {
    if (released) return
    released = true
    await reservation.release()
  }
  onTestFinished(release)
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(`${reservation.day}T12:00:00.000Z`))
  clearDailyAiCostTotalCacheForTesting()
  const restore = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, {
    enabled: true,
    daily_cap_microunits: dailyCapMicrounits,
  })
  try {
    return await fn(reservation.day)
  } finally {
    restore()
    clearDailyAiCostTotalCacheForTesting()
    vi.useRealTimers()
    await unlinkTestAiUsageUncertaintyKey(getAccountingUncertaintyKey(reservation.day))
    await release()
  }
}
