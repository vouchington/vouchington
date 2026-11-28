import { describe, expect, it } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import { parseEntityRelationSearchInput } from '@services/entity-relations'
import { encodeEntityRelationCursor, parseEntityRelationCursor } from '../cursor.mts'

const SUBJECT_ID = '01900000-0000-7000-8000-000000000001'
const OBJECT_ID = '01900000-0000-7000-8000-000000000002'
const CREATED_AT = '2026-11-27T12:00:00.000000Z'

function createCursorContext(): Context {
  const fail = (status: number, message: string): never => {
    throw Object.assign(new Error(message), { status })
  }
  return {
    throw: fail,
    assert(condition: unknown, status: number, message: string) {
      if (!condition) fail(status, message)
    },
  } as unknown as Context
}

function encodeRawCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

describe('entity relation pagination cursor', () => {
  it('encodes cursors without order_index or orderIndex and round-trips them', () => {
    const ctx = createCursorContext()
    const parsed = parseEntityRelationSearchInput({
      entityType: 'post',
      entityId: SUBJECT_ID,
      predicate: 'category',
      objectType: 'topic',
      sort: 'best',
    })
    const scope = `entity-relations:post:${SUBJECT_ID}:category:topic:best::`

    const encoded = encodeEntityRelationCursor(
      {
        id: SUBJECT_ID,
        object_id: OBJECT_ID,
        created_at: new Date(CREATED_AT),
        cursor_created_at: CREATED_AT,
        votes_score_sort: 0.75,
      },
      scope,
      parsed,
    )
    const raw = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >
    expect(raw).not.toHaveProperty('order_index')
    expect(raw).not.toHaveProperty('orderIndex')

    expect(parseEntityRelationCursor(ctx, encoded, scope, parsed)).toEqual({
      id: OBJECT_ID,
      createdAt: CREATED_AT,
      votesScoreSort: 0.75,
    })
  })

  it('rejects cursors missing created_at with 400 even when orderIndex is present', () => {
    const ctx = createCursorContext()
    const parsed = parseEntityRelationSearchInput({
      entityType: 'post',
      entityId: SUBJECT_ID,
      predicate: 'category',
      objectType: 'topic',
      sort: 'best',
    })
    const scope = `entity-relations:post:${SUBJECT_ID}:category:topic:best::`
    const encoded = encodeRawCursor({
      id: OBJECT_ID,
      scope,
      sort: 'best',
      votes_score_sort: 0.42,
      orderIndex: 2,
      order_index: 2,
    })

    expect(() => parseEntityRelationCursor(ctx, encoded, scope, parsed)).toThrow(
      expect.objectContaining({ status: 400 }),
    )
  })
})
