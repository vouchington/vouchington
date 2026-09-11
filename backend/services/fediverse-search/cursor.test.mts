import { describe, expect, it } from 'vitest'
import {
  decodeFediverseCursor,
  encodeFediverseCursor,
  FEDIVERSE_CURSOR_MAX_LENGTH,
} from './cursor.mts'

describe('fediverse cursors', () => {
  it('round-trips a value for its own provider', () => {
    const cursor = encodeFediverseCursor('peertube', 'offset:20')
    expect(decodeFediverseCursor(cursor, 'peertube')).toBe('offset:20')
  })

  it('rejects a cursor minted for a different provider', () => {
    const cursor = encodeFediverseCursor('peertube', 'offset:20')
    expect(decodeFediverseCursor(cursor, 'mastodon')).toBeUndefined()
  })

  it('rejects malformed cursors', () => {
    expect(decodeFediverseCursor('not-base64url-json', 'peertube')).toBeUndefined()
    expect(
      decodeFediverseCursor(Buffer.from('{}').toString('base64url'), 'peertube'),
    ).toBeUndefined()
  })

  it('rejects undefined and empty cursors', () => {
    expect(decodeFediverseCursor(undefined, 'peertube')).toBeUndefined()
    expect(decodeFediverseCursor('', 'peertube')).toBeUndefined()
  })

  it('rejects oversized cursors', () => {
    const oversized = 'x'.repeat(FEDIVERSE_CURSOR_MAX_LENGTH + 1)
    expect(decodeFediverseCursor(oversized, 'peertube')).toBeUndefined()
  })
})
