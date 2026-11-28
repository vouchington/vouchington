import { read } from '@data-stores/psql'
import type { RssFeedDispatchCursor, RssFeedDispatchPage } from './get-to-fetch-types.mts'
import * as crawlConfig from './crawl-config.mts'
import { FAILING_DISPATCH_LANE, getRssFeedsFailing } from './get-to-fetch-failing.mts'
import { getRssFeedsHealthy } from './get-to-fetch-healthy.mts'

export { FAILING_DISPATCH_LANE } from './get-to-fetch-failing.mts'
export type {
  RssFeedDispatchCursor,
  RssFeedDispatchPage,
  RssFeedToFetch,
} from './get-to-fetch-types.mts'

const DEFAULT_RAW_READ_MULTIPLIER = 10
const MAX_RAW_READ_BUDGET = 10_000

export function getCrawlRawReadBudget(): number {
  return Math.min(
    crawlConfig.getCrawlCapacityBudget() * DEFAULT_RAW_READ_MULTIPLIER,
    MAX_RAW_READ_BUDGET,
  )
}

type GetRssFeedsToFetchOptions = {
  limit?: number
  rawBudget?: number
  cursor?: RssFeedDispatchCursor
  asOf?: Date
}

function validateCursorTimestamp(value: string | null | undefined): void {
  if (value !== undefined && value !== null && Number.isNaN(Date.parse(value))) {
    throw new RangeError('Invalid RSS dispatch cursor timestamp')
  }
}

async function getRssFeedsTiered(
  limit: number,
  rawBudget: number,
  asOf: Date,
  cursor?: RssFeedDispatchCursor,
): Promise<RssFeedDispatchPage> {
  const lane = cursor?.lane ?? 1
  if (!Number.isSafeInteger(lane) || lane < 1 || lane > 10)
    throw new RangeError('Invalid RSS dispatch lane')
  validateCursorTimestamp(cursor?.afterLastSucceededAt)
  validateCursorTimestamp(cursor?.afterLastFailedAt)
  const throughId =
    cursor?.throughId ??
    (
      await read<{ id: string }>(
        `/* getRssFeedDispatchUpperId */ SELECT rss_feed_id AS id FROM rss_feed_fetch_states ORDER BY rss_feed_id DESC LIMIT 1`,
      )
    ).rows[0]?.id
  if (!throughId) return { feeds: [], rawRowsRead: 0 }
  if (lane === FAILING_DISPATCH_LANE) {
    return getRssFeedsFailing(limit, rawBudget, asOf, throughId, cursor)
  }
  return getRssFeedsHealthy(limit, rawBudget, asOf, lane, throughId, cursor)
}

export function getRssFeedsToFetch({
  limit,
  rawBudget,
  cursor,
  asOf = new Date(),
}: GetRssFeedsToFetchOptions = {}): Promise<RssFeedDispatchPage> {
  const capacityBudget = crawlConfig.getCrawlCapacityBudget()
  const budget = Math.min(limit ?? capacityBudget, capacityBudget)
  const asOfMs = asOf.getTime()
  if (!Number.isFinite(asOfMs)) throw new RangeError('Invalid RSS tier scheduling time')
  const defaultRawBudget = getCrawlRawReadBudget()
  const physicalBudget = Math.min(rawBudget ?? defaultRawBudget, MAX_RAW_READ_BUDGET)
  if (!Number.isSafeInteger(physicalBudget) || physicalBudget < 1)
    throw new RangeError('RSS raw budget must be a positive safe integer')
  return getRssFeedsTiered(
    Math.min(budget, physicalBudget),
    physicalBudget,
    new Date(asOfMs),
    cursor,
  )
}

export { getRssFeedByIdToFetch } from './get-by-id-to-fetch.mts'
