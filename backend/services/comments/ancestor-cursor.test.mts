import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decodeCommentAncestorCursor, encodeCommentAncestorCursor } from './ancestor-cursor.mts'

const target_id = '123e4567-e89b-12d3-a456-426614174000'
const root_id = '123e4567-e89b-12d3-a456-426614174001'
const id = '123e4567-e89b-12d3-a456-426614174002'
const next_id = '123e4567-e89b-12d3-a456-426614174003'

describe('comment ancestor cursor', () => {
  beforeEach(() => {
    vi.stubEnv('VOUCHA_OTP_TOKEN_HASH_SECRET', 'test comment ancestor cursor secret')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('round-trips a signed cursor only for its target and root', () => {
    const cursor = encodeCommentAncestorCursor({ id, next_id, role: 'end', root_id, target_id })

    expect(decodeCommentAncestorCursor(cursor, { root_id, target_id })).toEqual({
      id,
      next_id,
      role: 'end',
      root_id,
      target_id,
      v: 1,
    })
    expect(() =>
      decodeCommentAncestorCursor(cursor, {
        root_id,
        target_id: '123e4567-e89b-12d3-a456-426614174004',
      }),
    ).toThrow('Invalid ancestor cursor')
  })

  it('rejects tampered cursor payloads', () => {
    const cursor = encodeCommentAncestorCursor({ id, next_id, role: 'end', root_id, target_id })
    const [payload, signature] = cursor.split('.')
    const tampered = `${payload!.slice(0, -1)}x.${signature}`

    expect(() => decodeCommentAncestorCursor(tampered, { root_id, target_id })).toThrow(
      'Invalid ancestor cursor',
    )
  })

  it('rejects a signed start cursor as a continuation cursor', () => {
    const cursor = encodeCommentAncestorCursor({ id, next_id, role: 'start', root_id, target_id })

    expect(() => decodeCommentAncestorCursor(cursor, { root_id, target_id })).toThrow(
      'Invalid ancestor cursor',
    )
  })
})
