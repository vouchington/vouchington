import { describe, expect, it } from 'vitest'
import {
  buildPageInfo,
  decodeCursor,
  decodeScopedUuidCursor,
  encodeCursor,
  encodeScopedUuidCursor,
  sliceRawKeysetPage,
  sortMembershipKeysetRows,
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
    const encoded = Buffer.from(JSON.stringify({ id })).toString('base64').replace(/[=]+$/, '')
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

describe('membership keyset order', () => {
  it('slices a shuffled window into created_us DESC, entity_id DESC order', () => {
    const newerLow = '019d0000-0000-7000-8000-000000000001'
    const older = '019d0000-0000-7000-8000-000000000002'
    const newerHigh = '019d0000-0000-7000-8000-000000000003'
    const middle = '019d0000-0000-7000-8000-00000000000a'
    const shuffled = [
      { entity_id: older, created_us: 10, eligible: true },
      { entity_id: newerLow, created_us: 30, eligible: false },
      { entity_id: middle, created_us: 20, eligible: true },
      { entity_id: newerHigh, created_us: 30, eligible: true },
    ]
    const expected = [
      { entity_id: newerHigh, created_us: 30, eligible: true },
      { entity_id: newerLow, created_us: 30, eligible: false },
      { entity_id: middle, created_us: 20, eligible: true },
    ]

    expect(shuffled.map(row => row.entity_id)).not.toEqual(expected.map(row => row.entity_id))
    const { window, hasMore } = sliceRawKeysetPage(sortMembershipKeysetRows(shuffled), 3)

    expect(window).toEqual(expected)
    expect(hasMore).toBe(true)
  })
})
