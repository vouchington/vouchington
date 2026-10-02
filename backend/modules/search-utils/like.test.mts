import { describe, expect, it } from 'vitest'
import { escapeLikePattern } from './like.mts'

describe('escapeLikePattern', () => {
  it('escapes LIKE metacharacters and backslashes', () => {
    expect(escapeLikePattern('100%_\\cards')).toBe('100\\%\\_\\\\cards')
  })
})
