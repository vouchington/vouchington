import { timingSafeEqual } from 'node:crypto'
import { hashToken } from '@modules/token-secrets'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'

const CURSOR_PURPOSE = 'comment-ancestor-pagination-v1'

type CommentAncestorCursor = {
  id: string
  next_id: string
  role: 'end' | 'start'
  root_id: string
  target_id: string
  v: 1
}

export function encodeCommentAncestorCursor(cursor: Omit<CommentAncestorCursor, 'v'>): string {
  const payload = Buffer.from(JSON.stringify({ ...cursor, v: 1 })).toString('base64url')
  return `${payload}.${hashToken(CURSOR_PURPOSE, payload)}`
}

export function decodeCommentAncestorCursor(
  encoded: string,
  expected: Pick<CommentAncestorCursor, 'root_id' | 'target_id'>,
): CommentAncestorCursor {
  const [payload, signature, extra] = encoded.split('.')
  if (!payload || !signature || extra !== undefined || !hasValidSignature(payload, signature)) {
    throw createError(400, 'Invalid ancestor cursor')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    throw createError(400, 'Invalid ancestor cursor')
  }
  if (!isCommentAncestorCursor(parsed)) throw createError(400, 'Invalid ancestor cursor')
  if (parsed.role !== 'end') throw createError(400, 'Invalid ancestor cursor')
  if (parsed.target_id !== expected.target_id || parsed.root_id !== expected.root_id) {
    throw createError(400, 'Invalid ancestor cursor')
  }
  return parsed
}

function hasValidSignature(payload: string, signature: string): boolean {
  const expected = Buffer.from(hashToken(CURSOR_PURPOSE, payload), 'utf8')
  const actual = Buffer.from(signature, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function isCommentAncestorCursor(value: unknown): value is CommentAncestorCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const cursor = value as Record<string, unknown>
  return (
    Object.keys(cursor).length === 6 &&
    cursor.v === 1 &&
    typeof cursor.id === 'string' &&
    isUUID(cursor.id) &&
    typeof cursor.next_id === 'string' &&
    isUUID(cursor.next_id) &&
    (cursor.role === 'end' || cursor.role === 'start') &&
    typeof cursor.root_id === 'string' &&
    isUUID(cursor.root_id) &&
    typeof cursor.target_id === 'string' &&
    isUUID(cursor.target_id)
  )
}
