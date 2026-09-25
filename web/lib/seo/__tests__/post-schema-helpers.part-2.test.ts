import { describe, expect, it } from 'vitest'

import { buildInteractionStats } from '../post-schema-helpers'

describe('post-schema-helpers', () => {
  describe('buildInteractionStats', () => {
    it('returns undefined when both election and metrics are missing', () => {
      const stats = buildInteractionStats(undefined, undefined)
      expect(stats).toBeUndefined()
    })

    it('builds stats with upvotes from election', () => {
      const election = {
        __entity_type: 'post_election' as const,
        id: 'election1',
        votes_score_net: 39,
        votes_count_up: 42,
        votes_count_down: 3,
      }

      const stats = buildInteractionStats(election, undefined)
      expect(stats).toEqual({
        upvotes: 42,
        commentCount: undefined,
      })
    })

    it('builds stats with comment count from metrics', () => {
      const metrics = {
        __entity_type: 'post_metrics' as const,
        id: 'metrics1',
        count: {
          descendants: 15,
          children: 10,
          ancestors: 2,
        },
        updated_at: '2026-03-01T00:00:00.000Z',
        bookmarks: {
          follow: 5,
          save: 8,
        },
      }

      const stats = buildInteractionStats(undefined, metrics)
      expect(stats).toEqual({
        upvotes: undefined,
        commentCount: 15,
      })
    })

    it('builds complete stats from both election and metrics', () => {
      const election = {
        __entity_type: 'post_election' as const,
        id: 'election1',
        votes_score_net: 39,
        votes_count_up: 42,
        votes_count_down: 3,
      }

      const metrics = {
        __entity_type: 'post_metrics' as const,
        id: 'metrics1',
        count: {
          descendants: 15,
          children: 10,
          ancestors: 2,
        },
        updated_at: '2026-03-01T00:00:00.000Z',
        bookmarks: {
          follow: 5,
          save: 8,
        },
      }

      const stats = buildInteractionStats(election, metrics)
      expect(stats).toEqual({
        upvotes: 42,
        commentCount: 15,
      })
    })

    it('handles zero values correctly', () => {
      const election = {
        __entity_type: 'post_election' as const,
        id: 'election1',
        votes_score_net: 0,
        votes_count_up: 0,
        votes_count_down: 0,
      }

      const metrics = {
        __entity_type: 'post_metrics' as const,
        id: 'metrics1',
        count: {
          descendants: 0,
          children: 0,
          ancestors: 0,
        },
        updated_at: '2026-03-01T00:00:00.000Z',
        bookmarks: {
          follow: 0,
          save: 0,
        },
      }

      const stats = buildInteractionStats(election, metrics)
      expect(stats).toEqual({
        upvotes: 0,
        commentCount: 0,
      })
    })
  })
})
