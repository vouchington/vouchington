import { describe, expect, it } from 'vitest'
import {
  shouldExcludeCommunityPinnedPosts,
  shouldIncludeCommunityPinnedPosts,
} from './posts-pinned-helpers.mts'

describe('shouldIncludeCommunityPinnedPosts', () => {
  it('includes pins only on the unfiltered first page', () => {
    expect(
      shouldIncludeCommunityPinnedPosts({
        after: undefined,
        textSearchQuery: undefined,
        topicIds: [],
      }),
    ).toBe(true)
    expect(shouldIncludeCommunityPinnedPosts({ after: 'cursor', topicIds: [] })).toBe(false)
    expect(shouldIncludeCommunityPinnedPosts({ textSearchQuery: 'query', topicIds: [] })).toBe(
      false,
    )
    expect(shouldIncludeCommunityPinnedPosts({ topicIds: ['topic-1'] })).toBe(false)
    expect(shouldIncludeCommunityPinnedPosts({ hasHashtagFilter: true, topicIds: [] })).toBe(false)
  })

  it('excludes pins from unfiltered result pages even after the first page', () => {
    expect(shouldExcludeCommunityPinnedPosts({ textSearchQuery: undefined, topicIds: [] })).toBe(
      true,
    )
    expect(shouldExcludeCommunityPinnedPosts({ textSearchQuery: 'query', topicIds: [] })).toBe(
      false,
    )
    expect(shouldExcludeCommunityPinnedPosts({ topicIds: ['topic-1'] })).toBe(false)
    expect(shouldExcludeCommunityPinnedPosts({ hasHashtagFilter: true, topicIds: [] })).toBe(false)
  })
})
