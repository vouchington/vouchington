import {
  buildMonthlyPartitionName,
  createMonthlyPartitions,
  DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS,
  DEFAULT_MONTHLY_PARTITION_PAST_MONTHS,
} from '@vouchington/postgres/partitions'
import sql from 'sql-template-strings'
import { AI_USAGE_PARTITION_TABLES } from './config-driven/utils/partition-config.mts'
import { beginTransaction, write } from './setup.mts'

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

/** Prepare only a missing exact month, in a committed DDL transaction before recording usage. */
export async function prepareAiUsageMonth(createdAt: Date): Promise<void> {
  const partition = buildMonthlyPartitionName(
    config.table,
    createdAt.getUTCFullYear(),
    createdAt.getUTCMonth() + 1,
  )
  if (await isAiUsageMonthAttached(partition)) return

  try {
    await using transaction = await beginTransaction()
    await createMonthlyPartitions(transaction, {
      tables: [{ ...config, pastMonths: 0, futureMonths: 0 }],
      baseDate: createdAt,
    })
    await transaction.commit()
  } catch (err) {
    // Another preparer may have committed the same child after our catalog probe.
    if (isConcurrentPartitionCreation(err) && (await isAiUsageMonthAttached(partition))) return
    throw err
  }
  if (!(await isAiUsageMonthAttached(partition))) {
    throw new Error(`AI usage month ${partition} was not attached after preparation`)
  }
}

async function isAiUsageMonthAttached(partition: string): Promise<boolean> {
  const { rows } = await write<{ attached: boolean }>(sql`/* isAiUsageMonthAttached */
    SELECT EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhparent = 'ai_usage_records'::regclass
        AND inhrelid = to_regclass(${partition})
    ) AS attached
  `)
  return rows[0]?.attached ?? false
}

function isConcurrentPartitionCreation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error.code === '23505' || error.code === '42P07' || error.code === '42710')
  )
}
