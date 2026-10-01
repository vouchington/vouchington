import { describe, expect, it } from 'vitest'
import { makeResult, post } from './fixtures.mts'

describe('post-publication result fixture cursors', () => {
  it('preserves explicit null cursor overrides and defaults only omitted values', () => {
    expect(makeResult({ processed: 1, cursorPostId: null, cursorKeyId: null })).toMatchObject({
      cursorPostId: null,
      cursorKeyId: null,
    })
    expect(makeResult({ processed: 1 })).toMatchObject({ cursorPostId: post.id, cursorKeyId: null })
  })
})
