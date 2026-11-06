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
  if (typeof value !== 'string' || !PUBLISHED_AT_PATTERN.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(5, 7))
  const day = Number(value.slice(8, 10))
  const hour = Number(value.slice(11, 13))
  const minute = Number(value.slice(14, 16))
  const second = Number(value.slice(17, 19))
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) {
    return false
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return day >= 1 && day <= lastDay
}
