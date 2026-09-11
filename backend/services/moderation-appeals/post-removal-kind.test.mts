import { describe, expect, it } from 'vitest'
import { selectPostRemovalKind } from './post-removal-kind.mts'

const platformState = { rejected_at: new Date(), community_unpublished_at: null }
const communityState = { rejected_at: null, community_unpublished_at: new Date() }
const bothState = { rejected_at: new Date(), community_unpublished_at: new Date() }
const neitherState = { rejected_at: null, community_unpublished_at: null }

describe('selectPostRemovalKind', () => {
  describe('requestedKind = "platform"', () => {
    it('returns "platform" when post has been rejected by platform', () => {
      expect(selectPostRemovalKind('platform', platformState)).toBe('platform')
    })

    it('throws 422 when post has not been rejected by platform', () => {
      expect(() => selectPostRemovalKind('platform', communityState)).toThrow(
        'Post has not been removed by platform moderation',
      )
    })

    it('returns "platform" when both platform and community removals exist', () => {
      expect(selectPostRemovalKind('platform', bothState)).toBe('platform')
    })
  })

  describe('requestedKind = "community"', () => {
    it('returns "community" when post has community removal', () => {
      expect(selectPostRemovalKind('community', communityState)).toBe('community')
    })

    it('throws 422 when post has not been removed by community', () => {
      expect(() => selectPostRemovalKind('community', platformState)).toThrow(
        'Post has not been removed by community moderation',
      )
    })
  })

  describe('requestedKind = undefined (auto-select)', () => {
    it('returns "platform" when only platform rejection exists', () => {
      expect(selectPostRemovalKind(undefined, platformState)).toBe('platform')
    })

    it('returns "community" when only community removal exists', () => {
      expect(selectPostRemovalKind(undefined, communityState)).toBe('community')
    })

    it('returns "platform" when both removals exist (platform takes priority)', () => {
      expect(selectPostRemovalKind(undefined, bothState)).toBe('platform')
    })

    it('returns "community" when neither removal exists', () => {
      expect(selectPostRemovalKind(undefined, neitherState)).toBe('community')
    })
  })
})
