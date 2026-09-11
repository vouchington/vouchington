import { it, expect, describe, beforeAll } from 'vitest'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'
import { upsertPodcastShow, getPodcastShow } from '../podcast-show.mts'

describe('podcast-show', () => {
  let rssFeedId: string

  beforeAll(async () => {
    const feed = await createTestRssFeed({})
    rssFeedId = feed.id
  }, 60_000)

  describe('upsertPodcastShow', () => {
    it('inserts podcast show metadata for a new feed', async () => {
      await upsertPodcastShow(rssFeedId, {
        itunes_author: 'NPR',
        itunes_owner_name: 'NPR Podcasts',
        itunes_owner_email: 'podcasts@npr.org',
        cover_art_url: 'https://example.com/cover.jpg',
        is_explicit: false,
        itunes_type: 'episodic',
        description: 'A podcast about money.',
      })

      const result = await getPodcastShow(rssFeedId)
      expect(result).not.toBeNull()
      expect(result?.itunes_author).toBe('NPR')
      expect(result?.itunes_owner_name).toBe('NPR Podcasts')
      expect(result?.itunes_owner_email).toBe('podcasts@npr.org')
      expect(result?.cover_art_url).toBe('https://example.com/cover.jpg')
      expect(result?.is_explicit).toBe(false)
      expect(result?.itunes_type).toBe('episodic')
      expect(result?.description).toBe('A podcast about money.')
    }, 30_000)

    it('updates existing podcast show metadata on conflict', async () => {
      // First insert
      await upsertPodcastShow(rssFeedId, {
        itunes_author: 'Original Author',
        itunes_owner_name: null,
        itunes_owner_email: null,
        cover_art_url: null,
        is_explicit: false,
        itunes_type: null,
        description: null,
      })

      // Update
      await upsertPodcastShow(rssFeedId, {
        itunes_author: 'Updated Author',
        itunes_owner_name: 'Owner Name',
        itunes_owner_email: null,
        cover_art_url: 'https://example.com/new-cover.jpg',
        is_explicit: true,
        itunes_type: 'serial',
        description: 'Updated description.',
      })

      const result = await getPodcastShow(rssFeedId)
      expect(result?.itunes_author).toBe('Updated Author')
      expect(result?.itunes_owner_name).toBe('Owner Name')
      expect(result?.cover_art_url).toBe('https://example.com/new-cover.jpg')
      expect(result?.is_explicit).toBe(true)
      expect(result?.itunes_type).toBe('serial')
    }, 30_000)

    it('handles null metadata fields', async () => {
      const feed = await createTestRssFeed({})
      await upsertPodcastShow(feed.id, {
        itunes_author: null,
        itunes_owner_name: null,
        itunes_owner_email: null,
        cover_art_url: null,
        is_explicit: false,
        itunes_type: null,
        description: null,
      })

      const result = await getPodcastShow(feed.id)
      expect(result).not.toBeNull()
      expect(result?.itunes_author).toBeNull()
      expect(result?.itunes_type).toBeNull()
    }, 30_000)
  })

  describe('getPodcastShow', () => {
    it('returns null for a feed with no podcast show row', async () => {
      const feed = await createTestRssFeed({})
      const result = await getPodcastShow(feed.id)
      expect(result).toBeNull()
    }, 30_000)
  })
})
