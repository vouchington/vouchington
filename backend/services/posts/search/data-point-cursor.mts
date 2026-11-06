import { decodeCursor, hasExactKeys } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import createHttpError from 'http-errors'
import { DATA_POINT_CURSOR_KEYS, type DataPointCursor } from './data-point-types.mts'

export function decodeDataPointCursor(after: string | undefined): DataPointCursor | null {
  if (!after) return null
  const value = decodeCursor(after)
  if (!hasExactKeys(value, DATA_POINT_CURSOR_KEYS)) throw createHttpError(400, 'Invalid cursor')
  if (value.phase !== 'null' && value.phase !== 'community') {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (typeof value.parent_open !== 'boolean') throw createHttpError(400, 'Invalid cursor')
  if (
    value.community_id !== null &&
    (typeof value.community_id !== 'string' || !isUUID(value.community_id))
  ) {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (value.post_id !== null && (typeof value.post_id !== 'string' || !isUUID(value.post_id))) {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (value.parent_open && typeof value.post_id !== 'string') {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (value.phase === 'community' && typeof value.community_id !== 'string') {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (value.phase === 'null' && value.community_id !== null) {
    throw createHttpError(400, 'Invalid cursor')
  }
  if (!value.parent_open && value.post_id !== null) throw createHttpError(400, 'Invalid cursor')
  return {
    phase: value.phase,
    parent_open: value.parent_open,
    community_id: value.community_id,
    post_id: value.post_id,
  }
}
