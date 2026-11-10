import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'

import { postSearchCursorScope } from './get-ids-cursor.mts'
import { decodePostSearchCursor } from './get-ids-page-info.mts'

const postId = '00000000-0000-4000-8000-000000000001'
const asOfMs = 1_700_000_000_000

describe('post search page info', () => {
  it('decodes following_new cursors with ranking and id', () => {
    const after = encodeCursor({
      ranking: 12.5,
      id: postId,
      scope: postSearchCursorScope('following_new'),
    })
    expect(decodePostSearchCursor({ after }, 'following_new', false)).toEqual({
      ranking_lt: 12.5,
      id_lt: postId,
    })
  })

  it('rejects malformed following_new cursors', () => {
    expect(() =>
      decodePostSearchCursor({ after: encodeCursor({ id: postId }) }, 'following_new', false),
    ).toThrow('Invalid cursor for sort=following_new')
  })

  it('decodes and validates hot cursors', () => {
    const after = encodeCursor({
      score: 42,
      id: postId,
      scope: postSearchCursorScope('hot'),
    })
    expect(decodePostSearchCursor({ after }, 'hot', false)).toEqual({
      hot_score_lt: 42,
      id_lt: postId,
    })

    expect(() =>
      decodePostSearchCursor({ after: encodeCursor({ id: postId }) }, 'hot', false),
    ).toThrow('Invalid cursor for sort=hot')
  })

  it('rejects a cursor whose time range does not match the request', () => {
    const after = encodeCursor({
      id: postId,
      scope: postSearchCursorScope('new', '1w', asOfMs),
    })
    expect(decodePostSearchCursor({ after, time_range: '1w' }, 'new', false)).toEqual({
      id_lt: postId,
      as_of_ms: asOfMs,
    })
    expect(() => decodePostSearchCursor({ after }, 'new', false)).toThrow(
      'Invalid cursor for sort=new',
    )
    expect(() => decodePostSearchCursor({ after, time_range: 'all' }, 'new', false)).toThrow(
      'Invalid cursor for sort=new',
    )
  })

  it('rejects an unscoped cursor for a known sort', () => {
    expect(() =>
      decodePostSearchCursor({ after: encodeCursor({ id: postId }) }, 'new', false),
    ).toThrow('Invalid cursor for sort=new')
  })

  it('ignores cursors for unknown sort values', () => {
    expect(
      decodePostSearchCursor({ after: encodeCursor({ id: postId }) }, 'unsupported', false),
    ).toEqual({})
  })

  it('rejects a finite cursor whose age bound is not a post id', () => {
    const after = encodeCursor({
      id: postId,
      scope: postSearchCursorScope('new', '1m', 0),
    })
    expect(() => decodePostSearchCursor({ after, time_range: '1m' }, 'new', false)).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'Invalid cursor for sort=new' }),
    )
  })
})
