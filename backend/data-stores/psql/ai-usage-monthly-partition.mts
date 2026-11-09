import {
  buildMonthlyPartitionName,
  createMonthlyPartitions,
  DEFAULT_MONTHLY_PARTITION_FUTURE_MONTHS,
  DEFAULT_MONTHLY_PARTITION_PAST_MONTHS,
} from '@vouchington/postgres/partitions'
import sql from 'sql-template-strings'
import { AI_USAGE_PARTITION_TABLES } from './config-driven/utils/partition-config.mts'
import { beginTransaction, write } from './setup.mts'
import type { QueryExecutor } from './types.mts'

const config = AI_USAGE_PARTITION_TABLES[0]!

export class AiUsageMonthPreparationError extends Error {
  readonly missing: boolean

  constructor(partition: string, missing: boolean, options?: ErrorOptions) {
    super(
      missing
        ? `AI usage month ${partition} was missing after concurrent preparation`
        : `AI usage month ${partition} was not attached after preparation`,
      options,
    )
    this.name = 'AiUsageMonthPreparationError'
    this.missing = missing
  }
}

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
  if ((await getAiUsageMonthAttachmentState(partition)).attached) return

  try {
    await using transaction = await beginTransaction()
    await createMonthlyPartitions(transaction, {
      tables: [{ ...config, pastMonths: 0, futureMonths: 0 }],
      baseDate: createdAt,
    })
    const state = await getAiUsageMonthAttachmentState(partition, transaction)
    if (!state.attached) throw new AiUsageMonthPreparationError(partition, !state.present)
    await transaction.commit()
  } catch (err) {
    // Another preparer may have committed the same child after our catalog probe.
    if (isConcurrentPartitionCreation(err, partition)) {
      const state = await getAiUsageMonthAttachmentState(partition)
      if (state.attached) return
      if (!state.present) throw new AiUsageMonthPreparationError(partition, true, { cause: err })
    }
    throw err
  }
}

async function getAiUsageMonthAttachmentState(
  partition: string,
  query: QueryExecutor = write,
): Promise<{ attached: boolean; present: boolean }> {
  const { rows } = await query<{
    attached: boolean
    present: boolean
  }>(sql`/* isAiUsageMonthAttached */
    SELECT to_regclass(${partition}) IS NOT NULL AS present, EXISTS (
      SELECT 1 FROM pg_inherits
      WHERE inhparent = 'ai_usage_records'::regclass
        AND inhrelid = to_regclass(${partition})
    ) AS attached
  `)
  return rows[0] ?? { attached: false, present: false }
}

function isConcurrentPartitionCreation(error: unknown, partition: string): boolean {
  if (error === null || typeof error !== 'object') return false
  const pgError = error as {
    code?: string
    constraint?: string
    detail?: string
    message?: string
  }
  if (pgError.code === '23505') {
    return (
      (pgError.constraint === 'pg_class_relname_nsp_index' ||
        pgError.constraint === 'pg_type_typname_nsp_index' ||
        pgError.constraint === 'pg_constraint_conname_nsp_index') &&
      pgError.detail?.includes(partition) === true
    )
  }
  return (
    (pgError.code === '42P07' || pgError.code === '42710') &&
    pgError.message?.includes(partition) === true
  )
}
