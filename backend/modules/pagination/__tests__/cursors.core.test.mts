import { describe, expect, it } from 'vitest'
import { buildPageInfo, encodeCursor } from '../cursors.mts'

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
