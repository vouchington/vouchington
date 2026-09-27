import { describe, expect, it } from 'vitest'
import {
  buildPageInfo,
  decodeCursor,
  decodeScopedUuidCursor,
  encodeCursor,
  encodeScopedUuidCursor,
} from '../cursors.mts'

describe('cursor encoding', () => {
  it('round-trips canonical unpadded URL-safe cursors through the local facade', () => {
    const id = crypto.randomUUID()
    const scope = 'test-scope'
    const encoded = encodeScopedUuidCursor(id, scope)

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(decodeScopedUuidCursor(encoded, scope, 'Invalid cursor')).toEqual({ id, scope })
  })

  it('rejects padded Base64 encodings of valid cursor JSON', () => {
    const encoded = Buffer.from(JSON.stringify({ id: 'abcd' })).toString('base64')
    expect(encoded).toMatch(/[=]$/)

    expect(() => decodeCursor(encoded)).toThrow(expect.objectContaining({ status: 400 }))
  })

  it.each(['¾', '¿'])('rejects standard Base64 alphabet for valid cursor JSON %s', id => {
    const encoded = Buffer.from(JSON.stringify({ id })).toString('base64').replace(/=+$/, '')
    expect(encoded).toMatch(/[+/]/)

    expect(() => decodeCursor(encoded)).toThrow(expect.objectContaining({ status: 400 }))
  })
})

describe('buildPageInfo', () => {
  it('returns null cursors for an empty page', () => {
    expect(
      buildPageInfo([], {
        hasNextPage: false,
        getCursor: (item: { id: string }) => ({ id: item.id }),
      }),
    ).toEqual({ has_next_page: false, start_cursor: null, end_cursor: null })
  })

  it('returns encoded first and last cursors when another page exists', () => {
    expect(
      buildPageInfo([{ id: 'first' }, { id: 'last' }], {
        hasNextPage: true,
        getCursor: item => ({ id: item.id }),
      }),
    ).toEqual({
      has_next_page: true,
      start_cursor: encodeCursor({ id: 'first' }),
      end_cursor: encodeCursor({ id: 'last' }),
    })
  })

  it('omits the end cursor when the page is complete', () => {
    expect(
      buildPageInfo([{ id: 'only' }], {
        hasNextPage: false,
        getCursor: item => ({ id: item.id }),
      }),
    ).toEqual({
      has_next_page: false,
      start_cursor: encodeCursor({ id: 'only' }),
      end_cursor: null,
    })
  })
})
