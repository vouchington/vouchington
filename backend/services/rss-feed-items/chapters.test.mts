import { describe, expect, it } from 'vitest'
import { extractPodcastChaptersReference } from './chapters-reference.mts'
import { normalizePodcastChapters } from './chapters.mts'

// The buildRssFeedItemsFromFeed-level "persists chapter references" tests live in
// @services/crawler-rss/clean.build-items.chapters.test.mts (not here): rss-feed-items must
// not depend back on crawler-rss (that would create a @services/crawler-rss <->
// @services/rss-feed-items workspace cycle), but crawler-rss already depends on rss-feed-items
// for real (extractPodcastChaptersReference in clean.mts).
describe('podcast chapters', () => {
  describe('extractPodcastChaptersReference', () => {
    it('extracts podcast namespace chapter references', () => {
      expect(
        extractPodcastChaptersReference({
          podcast: {
            chapters: {
              url: 'https://cdn.example.com/episode/chapters.json',
              type: 'application/json+chapters',
            },
          },
        }),
      ).toEqual({
        url: 'https://cdn.example.com/episode/chapters.json',
        type: 'application/json+chapters',
      })
    })

    it('resolves relative chapter references against the feed URL', () => {
      expect(
        extractPodcastChaptersReference(
          { 'podcast:chapters': { url: '/episode/chapters.json' } },
          'https://podcast.example.com/feed.xml',
        ),
      ).toEqual({
        url: 'https://podcast.example.com/episode/chapters.json',
        type: null,
      })
    })

    it('extracts top-level chapter references with href', () => {
      expect(
        extractPodcastChaptersReference({
          chapters: { href: 'https://cdn.example.com/top-level.json' },
        }),
      ).toEqual({
        url: 'https://cdn.example.com/top-level.json',
        type: null,
      })
    })

    it('returns null when no chapter reference exists', () => {
      expect(extractPodcastChaptersReference({ title: 'Episode' })).toBeNull()
    })

    it('rejects invalid chapter reference URLs', () => {
      expect(
        extractPodcastChaptersReference({
          podcast: { chapters: { url: 'https://[invalid' } },
        }),
      ).toBeNull()
    })

    it('rejects non-HTTPS chapter references', () => {
      expect(
        extractPodcastChaptersReference({
          podcast: { chapters: { url: 'http://cdn.example.com/chapters.json' } },
        }),
      ).toBeNull()
    })
  })

  describe('normalizePodcastChapters', () => {
    it('normalizes, sorts, and filters chapter JSON', () => {
      const chapters = normalizePodcastChapters({
        chapters: [
          {
            startTime: 25,
            title: 'Second',
            url: 'https://example.com/second',
            img: 'https://example.com/second.jpg',
            toc: false,
          },
          { startTime: '00:00:05.000', endTime: '00:00:20.500', title: 'First' },
          { startTime: -1, title: 'Invalid' },
          { title: 'Missing start' },
        ],
      })

      expect(chapters).toMatchObject([
        {
          start_seconds: 5,
          end_seconds: 20.5,
          title: 'First',
          url: null,
          is_visible: true,
        },
        {
          start_seconds: 25,
          end_seconds: null,
          title: 'Second',
          url: 'https://example.com/second',
          is_visible: false,
        },
      ])
      expect(chapters[1]!.image_url).toContain('/sideload/')
    })

    it('caps chapters at 200 entries', () => {
      const chapters = normalizePodcastChapters({
        chapters: Array.from({ length: 205 }, (_, index) => ({
          startTime: index,
          title: `Chapter ${index}`,
        })),
      })

      expect(chapters).toHaveLength(200)
      expect(chapters.at(-1)?.start_seconds).toBe(199)
    })

    it('derives end_seconds from the next chapter when missing', () => {
      const chapters = normalizePodcastChapters({
        chapters: [
          { startTime: 0, title: 'Start' },
          { startTime: 60, title: 'Middle' },
          { startTime: 120, title: 'End' },
        ],
      })

      expect(chapters).toEqual([
        expect.objectContaining({ end_seconds: 60 }),
        expect.objectContaining({ end_seconds: 120 }),
        expect.objectContaining({ end_seconds: null }),
      ])
    })

    it('normalizes numeric string starts and invalid chapter links', () => {
      const chapters = normalizePodcastChapters({
        chapters: [
          {
            startTime: '12.5',
            title: 'Decimal start',
            url: 'https://[invalid',
          },
        ],
      })

      expect(chapters).toEqual([
        expect.objectContaining({
          start_seconds: 12.5,
          url: null,
        }),
      ])
    })

    it('preserves chapter link fragments', () => {
      const chapters = normalizePodcastChapters({
        chapters: [
          {
            startTime: 0,
            title: 'Intro',
            url: 'https://example.com/podcast-ep-1#intro',
          },
        ],
      })

      expect(chapters[0]?.url).toBe('https://example.com/podcast-ep-1#intro')
    })

    it('keeps title-less chapter markers with fallback labels', () => {
      const chapters = normalizePodcastChapters({
        chapters: [
          { startTime: 0, img: 'https://example.com/cover.jpg', toc: false },
          { title: '', startTime: 30, url: 'https://example.com/marker' },
          { title: 'No start' },
        ],
      })

      expect(chapters).toMatchObject([
        { start_seconds: 0, title: 'Chapter 1', is_visible: false },
        { start_seconds: 30, title: 'Chapter 2', url: 'https://example.com/marker' },
      ])
      expect(chapters).toHaveLength(2)
    })

    it('drops chapter markers with oversized or negative times', () => {
      const chapters = normalizePodcastChapters({
        chapters: [
          { title: 'Huge', startTime: 1e100 },
          { title: 'Negative end', startTime: 0, endTime: -1 },
          { title: 'Too long', startTime: '1000000' },
          { title: 'Valid', startTime: 10, endTime: 20 },
        ],
      })

      expect(chapters).toEqual([
        expect.objectContaining({ title: 'Negative end', start_seconds: 0, end_seconds: 10 }),
        expect.objectContaining({ title: 'Valid', start_seconds: 10, end_seconds: 20 }),
      ])
    })

    it('proxies chapter images through /sideload/', () => {
      const chapters = normalizePodcastChapters({
        chapters: [{ startTime: 0, title: 'One', image: 'https://example.com/one.jpg' }],
      })

      expect(chapters[0]?.image_url).toMatch(/^https?:\/\/[^/]+\/sideload\//)
      expect(chapters[0]?.image_url).toContain('w=400')
    })
  })
})
