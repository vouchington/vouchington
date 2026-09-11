import { decodeUuidCursor, isNameCursor, isScoreCursor } from '@modules/pagination'
import type { CommunitySortMode } from '../search.mts'

export type CommunitySearchCursor = {
  cursorName?: string
  cursorId?: string
  cursorScore?: number
}

export function parseCommunitySearchCursor(
  after: string | undefined,
  sort: CommunitySortMode,
): CommunitySearchCursor {
  if (!after) return {}
  if (sort === 'name') {
    const cursor = decodeUuidCursor(after, isNameCursor, 'Invalid cursor format')
    return { cursorName: cursor.name, cursorId: cursor.id }
  }
  const cursor = decodeUuidCursor(after, isScoreCursor, 'Invalid cursor format')
  return { cursorScore: cursor.score, cursorId: cursor.id }
}
