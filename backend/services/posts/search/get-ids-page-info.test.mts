import { encodeCursor } from '@modules/pagination'
import { describe, expect, it } from 'vitest'

import { decodePostSearchCursor } from './get-ids-page-info.mts'

const postId = '00000000-0000-4000-8000-000000000001'

describe('post search page info', () => {
  it('decodes following_new cursors with ranking and id', () => {
    expect(
      decodePostSearchCursor(
        { after: encodeCursor({ ranking: 12.5, id: postId }) },
        'following_new',
        false,
      ),
    ).toEqual({ ranking_lt: 12.5, id_lt: postId })
  })

  it('rejects malformed following_new cursors', () => {
    expect(() =>
      decodePostSearchCursor({ after: encodeCursor({ id: postId }) }, 'following_new', false),
    ).toThrow('Invalid cursor for sort=following_new')
  })

  it('decodes and validates hot cursors', () => {
    expect(
      decodePostSearchCursor({ after: encodeCursor({ score: 42, id: postId }) }, 'hot', false),
    ).toEqual({ hot_score_lt: 42, id_lt: postId })

    expect(() =>
      decodePostSearchCursor({ after: encodeCursor({ id: postId }) }, 'hot', false),
    ).toThrow('Invalid cursor for sort=hot')
  })

  it('ignores cursors for unknown sort values', () => {
    expect(
      decodePostSearchCursor({ after: encodeCursor({ id: postId }) }, 'unsupported', false),
    ).toEqual({})
  })
})
