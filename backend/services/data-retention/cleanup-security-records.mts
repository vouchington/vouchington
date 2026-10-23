import { beginTransaction } from '@data-stores/psql'
import type { DataRetentionLimits } from './config.mts'
import { cleanupSecuritySourcePageInTransaction } from './security-record-page.mts'
import { SOURCES, type Source } from './security-record-plans.mts'

type Page = { deleted: number; hasMore: boolean }

/** Every source owns a durable (eligibility timestamp, UUIDv7 id) cursor. */
export async function cleanupSecurityRecords(
  limits: DataRetentionLimits,
  now = new Date(),
): Promise<Page> {
  const maxBatches = Math.min(limits.maxBatches, SOURCES.length)
  if (!Number.isSafeInteger(maxBatches) || maxBatches < 1) {
    throw new RangeError('Security cleanup requires a positive maxBatches')
  }
  if (!Number.isSafeInteger(limits.batchSize) || limits.batchSize < 1) {
    throw new RangeError('Security cleanup requires a positive batchSize')
  }
  // Rotate the first source daily: a small run cap cannot starve the later families.
  const start = Math.floor(now.getTime() / 86_400_000) % SOURCES.length
  let deleted = 0
  let hasMore = maxBatches < SOURCES.length
  for (let index = 0; index < maxBatches; index++) {
    const source = SOURCES[(start + index) % SOURCES.length]!
    // oxlint-disable-next-line no-await-in-loop -- each source commits its own cursor and bounded deletion page.
    const page = await cleanupSecuritySourcePage(source, limits.batchSize, now) // no-mistakes-disable-line query-reached-per-item: at most 12 fixed families, each owns a locked cursor and one indexed batchSize+1 page
    deleted += page.deleted
    hasMore ||= page.hasMore
  }
  return { deleted, hasMore }
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
