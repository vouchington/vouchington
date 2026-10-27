import { beginTransaction } from '@data-stores/psql'
import type { DataRetentionLimits } from './config.mts'
import { spendSecurityPageBudget } from './security-record-budget.mts'
import { cleanupSecuritySourcePageInTransaction } from './security-record-page.mts'
import { SOURCES, type Source } from './security-record-plans.mts'

type Page = { deleted: number; hasMore: boolean }

/** Every source owns a durable (eligibility timestamp, UUIDv7 id) cursor. */
export async function cleanupSecurityRecords(
  limits: DataRetentionLimits,
  now = new Date(),
): Promise<Page> {
  if (!Number.isSafeInteger(limits.maxBatches) || limits.maxBatches < 1) {
    throw new RangeError('Security cleanup requires a positive maxBatches')
  }
  if (!Number.isSafeInteger(limits.batchSize) || limits.batchSize < 1) {
    throw new RangeError('Security cleanup requires a positive batchSize')
  }
  // Rotate the first source daily: a small run cap cannot starve the later families.
  const start = Math.floor(now.getTime() / 86_400_000) % SOURCES.length
  return spendSecurityPageBudget(SOURCES, start, limits.maxBatches, source =>
    cleanupSecuritySourcePage(source, limits.batchSize, now),
  )
}

export async function cleanupSecuritySourcePage(
  source: Source,
  batchSize: number,
  now: Date,
): Promise<Page> {
  await using query = await beginTransaction()
  const page = await cleanupSecuritySourcePageInTransaction(query, source, batchSize, now)
  await query.commit()
  return page
}
