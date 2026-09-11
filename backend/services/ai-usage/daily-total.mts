import { write } from '@data-stores/psql'
import { getUtcDayUuidv7Bounds } from '@data-stores/psql/config-driven/utils/partition-utils'
import sql from 'sql-template-strings'
import { MAX_MONEY_AMOUNT, parsePostgresMoneyAmount } from '@ts-shared/money'
import { getCurrentUtcDay } from '@ts-shared/utils/dates'

const DAILY_AI_COST_TOTAL_CACHE_TTL_MS = 60_000

export type DailyAiCostTotal = {
  totalMicrounits: number
  // True when any row in the window has pricing_status = 'unpriced' (calcCostMicrounits,
  // @modules/openai-utils/pricing.mts, found no pricing-table entry for the model/service-tier
  // OpenAI actually served, so cost_microunits is NULL). Postgres's SUM() silently skips NULLs,
  // so totalMicrounits alone would under-count real spend here -- callers must fail closed on
  // this flag rather than trust the sum.
  hasUnpricedRows: boolean
  // The UTC day (`YYYY-MM-DD`) this total was queried for. A cap-breach caller must compute its
  // delay target from this, not from a fresh `new Date()` read -- the wall clock can advance past
  // UTC midnight during the async DB round-trip, landing the delay a day too far out.
  day: string
}

type DailyAiCostTotalCacheEntry = {
  day: string
  expiresAt: number
  promise: Promise<DailyAiCostTotal>
}

let dailyAiCostTotalCache: DailyAiCostTotalCacheEntry | null = null
let dailyAiCostTotalRefresh: Pick<DailyAiCostTotalCacheEntry, 'day' | 'promise'> | null = null

/**
 * Sums `cost_microunits` across every agent for the current UTC day. Unlike
 * `getCommunityAiCostTotals` (totals.mts), this has no `communities` join -- so NULL-community_id
 * agents (chat, autotagger, customer-support, ...) are included -- and is windowed to today, not
 * all-time. Backs the daily spend-ceiling check in the ai-agents worker (spend-cap-config.mts).
 *
 * `ai_usage_records.id` is UUIDv7 with no index on `created_at` (a `GENERATED ... STORED` column)
 * -- the window below is an id-range against the primary key via `getUtcDayUuidv7Bounds`, per
 * backend/data-stores/psql/CLAUDE.md's "query by id, not created_at" rule. The table sits in
 * `DEFERRED_LEDGER_PARTITION_TABLES` with a single DEFAULT partition, so partition pruning cannot
 * help here -- the in-process cache below keeps the aggregation off the per-job hot path.
 *
 * Reads via `write()` (primary), not `read()`: this backs a spend-ceiling breach check, which must
 * observe just-written rows rather than risk `READ_DATABASE_URL` replica lag under-reporting spend
 * (`.agents/skills/postgres-node-performance-tuning/SKILL.md`, lag-sensitive reads).
 */
export function getDailyAiCostTotalMicrounits(day = getCurrentUtcDay()): Promise<DailyAiCostTotal> {
  const now = Date.now()
  if (
    dailyAiCostTotalCache &&
    dailyAiCostTotalCache.day === day &&
    dailyAiCostTotalCache.expiresAt > now
  ) {
    return dailyAiCostTotalCache.promise
  }

  const promise = loadDailyAiCostTotalMicrounits(day).catch(error => {
    if (dailyAiCostTotalCache?.promise === promise) dailyAiCostTotalCache = null
    throw error as Error
  })
  dailyAiCostTotalCache = { day, expiresAt: now + DAILY_AI_COST_TOTAL_CACHE_TTL_MS, promise }
  return promise
}

/** Bypasses a resolved cache entry while coalescing concurrent primary-Postgres refreshes. */
export function refreshDailyAiCostTotalMicrounits(): Promise<DailyAiCostTotal> {
  const day = getCurrentUtcDay()
  if (dailyAiCostTotalRefresh?.day === day) return dailyAiCostTotalRefresh.promise

  const promise = loadDailyAiCostTotalMicrounits(day)
    .catch(error => {
      if (dailyAiCostTotalCache?.promise === promise) dailyAiCostTotalCache = null
      throw error as Error
    })
    .finally(() => {
      if (dailyAiCostTotalRefresh?.promise === promise) dailyAiCostTotalRefresh = null
    })
  dailyAiCostTotalCache = {
    day,
    expiresAt: Date.now() + DAILY_AI_COST_TOTAL_CACHE_TTL_MS,
    promise,
  }
  dailyAiCostTotalRefresh = { day, promise }
  return promise
}

async function loadDailyAiCostTotalMicrounits(day: string): Promise<DailyAiCostTotal> {
  const bounds = getUtcDayUuidv7Bounds(day)
  const { rows } = await write<{ total_microunits: string; has_unpriced_rows: boolean }>(
    sql`/* loadDailyAiCostTotalMicrounits */
    SELECT
      COALESCE(SUM(cost_microunits), 0)::TEXT AS total_microunits,
      COALESCE(BOOL_OR(pricing_status = 'unpriced'), false) AS has_unpriced_rows
    FROM ai_usage_records
    WHERE id >= ${bounds.startBound}
      AND id < ${bounds.endBound}
  `,
  )
  const row = rows[0]
  if (!row) throw new Error('getDailyAiCostTotalMicrounits query returned no result row')
  return {
    totalMicrounits: parseDailyTotalMicrounits(row.total_microunits),
    hasUnpricedRows: row.has_unpriced_rows,
    day,
  }
}

/**
 * A runaway ingestion day -- exactly the scenario this spend ceiling exists to catch -- can push
 * the raw SUM past MAX_MONEY_AMOUNT (Number.MAX_SAFE_INTEGER), and parsePostgresMoneyAmount throws
 * a RangeError on that overflow. The guard must fail closed (report the max representable amount,
 * which trips any realistic cap) rather than let the overflow crash the request with a 500.
 */
export function parseDailyTotalMicrounits(value: string): number {
  try {
    return parsePostgresMoneyAmount(value)
  } catch (error) {
    if (error instanceof RangeError) return MAX_MONEY_AMOUNT
    throw error as Error
  }
}

export function clearDailyAiCostTotalCacheForTesting(): void {
  dailyAiCostTotalCache = null
  dailyAiCostTotalRefresh = null
}
