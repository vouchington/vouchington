import {
  createMonthlyPartitions,
  DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS,
  DEFAULT_MONTHLY_PARTITION_PAST_MONTHS,
} from '@vouchington/postgres/partitions'
import { AI_USAGE_PARTITION_TABLES } from './config-driven/utils/partition-config.mts'
import type { QueryExecutor } from './types.mts'

const config = AI_USAGE_PARTITION_TABLES[0]!

/** The ordinary monthly creator already prepares this range around the current UTC month. */
export function needsAiUsageMonthCreation(createdAt: Date, now: Date): boolean {
  const month = createdAt.getUTCFullYear() * 12 + createdAt.getUTCMonth()
  const currentMonth = now.getUTCFullYear() * 12 + now.getUTCMonth()
  return (
    month < currentMonth - (config.pastMonths ?? DEFAULT_MONTHLY_PARTITION_PAST_MONTHS) ||
    month > currentMonth + (config.futureMonths ?? DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS)
  )
}

/** Caller keeps this transaction through its usage INSERT, fencing concurrent month retirement. */
export async function ensureAiUsageMonthForWrite(
  transaction: QueryExecutor,
  createdAt: Date,
): Promise<void> {
  await transaction(`/* ensureAiUsageMonthForWrite:lockParent */
    LOCK TABLE ai_usage_records IN ACCESS EXCLUSIVE MODE`)
  await createMonthlyPartitions(transaction, {
    tables: [{ ...config, pastMonths: 0, futureMonths: 0 }],
    baseDate: createdAt,
  })
}
