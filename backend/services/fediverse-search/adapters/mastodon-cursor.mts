import type { FediverseSearchBucket, FediverseSearchResult } from '../types.mts'
import { decodeFediverseCursor, encodeFediverseCursor } from '../cursor.mts'

export function readMastodonOffset(cursor: string | undefined): number {
  const value = decodeFediverseCursor(cursor, 'mastodon')
  const offset = value ? Number(value) : 0
  return Number.isFinite(offset) && offset > 0 ? offset : 0
}

export function buildMastodonBucket(
  items: FediverseSearchResult[],
  offset: number,
  limit: number,
  accessToken: string | undefined,
  rawCount: number = items.length,
): FediverseSearchBucket {
  // Mastodon rejects `offset` without a user token, so an unauthenticated
  // caller can never request a further page — never offer one.
  if (!accessToken || rawCount < limit) {
    return { provider: 'mastodon', status: 'ok', items }
  }
  return {
    provider: 'mastodon',
    status: 'ok',
    items,
    next_cursor: encodeFediverseCursor('mastodon', String(offset + rawCount)),
  }
}
