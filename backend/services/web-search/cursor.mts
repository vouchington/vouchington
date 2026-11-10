import { createHash } from 'node:crypto'
import assert from 'http-assert'
import { decodeUuidCursor, encodeCursor, hasExactKeys } from '@modules/pagination'

/** Content matches page by rank then URL id; URL-only matches follow them by URL id. */
export type WebSearchCursor =
  | { tier: 'content'; score: number; id: string }
  | { tier: 'url'; id: string }

type ContentCursor = { score: number; id: string; scope: string }
type UrlCursor = { tier: 1; id: string; scope: string }

const INVALID_CURSOR = 'Invalid web search cursor'

export function getWebSearchCursorScope(query: string): string {
  const scope = { resource: 'web-search', order: 'content:rank-desc,id-desc;url:id-desc', query }
  return createHash('sha256').update(JSON.stringify(scope)).digest('hex')
}

export function encodeWebSearchCursor(cursor: WebSearchCursor, scope: string): string {
  return encodeCursor(
    cursor.tier === 'content'
      ? { score: cursor.score, id: cursor.id, scope }
      : { tier: 1, id: cursor.id, scope },
  )
}

export function decodeWebSearchCursor(after: string, scope: string): WebSearchCursor {
  const cursor = decodeUuidCursor(after, isWebSearchCursor, INVALID_CURSOR)
  assert(cursor.scope === scope, 400, INVALID_CURSOR)
  return 'score' in cursor
    ? { tier: 'content', score: cursor.score, id: cursor.id }
    : { tier: 'url', id: cursor.id }
}

function isWebSearchCursor(value: unknown): value is ContentCursor | UrlCursor {
  if (hasExactKeys(value, ['score', 'id', 'scope'])) {
    const { score, id, scope } = value as Record<string, unknown>
    return Number.isFinite(score) && typeof id === 'string' && typeof scope === 'string'
  }
  if (!hasExactKeys(value, ['tier', 'id', 'scope'])) return false
  const { tier, id, scope } = value as Record<string, unknown>
  return tier === 1 && typeof id === 'string' && typeof scope === 'string'
}
