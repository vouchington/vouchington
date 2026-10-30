import { onTestFinished, vi } from 'vitest'
import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { refreshDailyAiCostTotalMicrounits, spendCapConfig } from '../services/ai-usage/index.mts'
import { overrideDynamicConfigFieldsForTest } from './dynamic-config.mts'
import { acquireTestAiUsageDateReservation } from './entities/ai-usage-date-reservation.mts'
import { insertTestAiUsageRecord } from './entities/ai-usage.mts'
import { timestampToUuidv7LowerBound } from '@ts-shared/utils/uuidv7'

/**
 * Runs `fn` on a reserved, clean AI-usage day with the spend cap enabled at `dailyCapMicrounits`.
 * `Date` is faked into that day so tests can isolate cap decisions from ambient usage.
 */
export async function withReservedAiUsageDay<T>(
  dailyCapMicrounits: number,
  fn: (day: string) => Promise<T>,
): Promise<T> {
  await spendCapConfig.waitForInitialization()
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
  // Zero cap allows an empty day. These zero-cap fixtures assert a breach, so record known spend.
  if (dailyCapMicrounits === 0) {
    await insertTestAiUsageRecord({
      id: timestampToUuidv7LowerBound(Date.now()),
      costMicrounits: 1,
    })
  }
  const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, {
    enabled: true,
    daily_cap_microunits: dailyCapMicrounits,
  })
  try {
    return await fn(reservation.day)
  } finally {
    restore()
    vi.useRealTimers()
    await release()
  }
}

/** Exercise authenticated spend-cap routes with the real clock and exact owned cap-breach rows. */
export async function withLiveAiUsageCapBreach<T>(fn: () => Promise<T>): Promise<T> {
  await spendCapConfig.waitForInitialization()
  const today = new Date()
  const dayStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const ids: string[] = []
  let cleanupPromise: Promise<void> | undefined
  const cleanup = () => {
    cleanupPromise ??= (async () => {
      if (ids.length > 0) {
        await write(sql`/* clearLiveAiUsageCapBreach */
          DELETE FROM ai_usage_records WHERE id = ANY(${ids}::uuid[])`)
        await refreshDailyAiCostTotalMicrounits()
      }
    })()
    return cleanupPromise
  }
  onTestFinished(cleanup)
  for (const offset of [12, 36]) {
    const lower = timestampToUuidv7LowerBound(dayStart + offset * 60 * 60 * 1000)
    const id = `${lower.slice(0, 24)}${randomBytes(6).toString('hex')}`
    ids.push(id)
    await insertTestAiUsageRecord({ id, costMicrounits: 1 })
  }
  await refreshDailyAiCostTotalMicrounits()
  const restore = overrideDynamicConfigFieldsForTest(spendCapConfig, {
    enabled: true,
    daily_cap_microunits: 0,
  })
  try {
    return await fn()
  } finally {
    restore()
    await cleanup()
  }
}
