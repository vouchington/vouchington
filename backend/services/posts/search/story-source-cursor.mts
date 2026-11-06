import { decodeCursor, hasExactKeys } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import createHttpError from 'http-errors'
import { PUBLISHED_AT_PATTERN, STORY_CURSOR_KEYS, type StoryCursor } from './story-source-types.mts'

export function decodeStoryCursor(after: string | undefined): StoryCursor | null {
  if (!after) return null
  const value = decodeCursor(after)
  if (!hasExactKeys(value, STORY_CURSOR_KEYS)) throw createHttpError(400, 'Invalid cursor')
  if (typeof value.feed_id !== 'string' || !isUUID(value.feed_id)) {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (typeof value.feed_open !== 'boolean') throw createHttpError(400, 'Invalid cursor')
  if (value.phase !== 'published' && value.phase !== 'missing') {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (value.item_id !== null && (typeof value.item_id !== 'string' || !isUUID(value.item_id))) {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (value.published_at !== null && !isPublishedAt(value.published_at)) {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (
    value.feed_open &&
    (typeof value.item_id !== 'string' ||
      (value.phase === 'published' && value.published_at === null))
  ) {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (!value.feed_open && (value.item_id !== null || value.published_at !== null)) {
    throw createHttpError(400, 'Invalid cursor')
  }
  return {
    feed_id: value.feed_id,
    feed_open: value.feed_open,
    phase: value.phase,
    item_id: value.item_id,
    published_at: value.published_at,
  }
}

function isPublishedAt(value: unknown): value is string {
  return typeof value === 'string' && PUBLISHED_AT_PATTERN.test(value)
}
