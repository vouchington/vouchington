import { it, expect, describe } from 'vitest'
import { parseDuration } from '@ts-shared/utils/dates'
import {
  classifyItemMediaType,
  extractEnclosure,
  extractVideoId,
  extractDuration,
  extractThumbnail,
  classifyFeedType,
  extractFirstImageSrc,
} from './media-classify.mts'

describe('media-classify', () => {
  // --- classifyItemMediaType ---

  it('classifyItemMediaType: audio/mpeg enclosure → audio', () => {
    const item = {
      link: 'https://example.com/ep1',
      guid: 'ep1',
      enclosures: [
        { url: 'https://cdn.example.com/ep1.mp3', type: 'audio/mpeg', length: 12345678 },
      ],
    }
    expect(classifyItemMediaType(item)).toBe('audio')
  })

  it('classifyItemMediaType: audio/ogg enclosure → audio', () => {
    const item = {
      link: 'https://example.com/ep2',
      guid: 'ep2',
      enclosures: [{ url: 'https://cdn.example.com/ep2.ogg', type: 'audio/ogg' }],
    }
    expect(classifyItemMediaType(item)).toBe('audio')
  })

  it('classifyItemMediaType: video/mp4 enclosure → video', () => {
    const item = {
      link: 'https://example.com/vid1',
      guid: 'vid1',
      enclosures: [{ url: 'https://cdn.example.com/vid1.mp4', type: 'video/mp4' }],
    }
    expect(classifyItemMediaType(item)).toBe('video')
  })

  it('classifyItemMediaType: yt.videoId → video', () => {
    const item = {
      link: 'https://www.youtube.com/watch?v=abc123',
      guid: 'yt:video:abc123',
      yt: { videoId: 'abc123', channelId: 'UCfoo' },
    }
    expect(classifyItemMediaType(item)).toBe('video')
  })

  it('classifyItemMediaType: yt:videoId string key → video', () => {
    const item = {
      link: 'https://www.youtube.com/watch?v=def456',
      guid: 'yt:video:def456',
      'yt:videoId': 'def456',
    }
    expect(classifyItemMediaType(item)).toBe('video')
  })

  it('classifyItemMediaType: itunes.duration (no enclosure) → audio', () => {
    const item = {
      link: 'https://podcast.example.com/ep3',
      guid: 'ep3',
      itunes: { duration: '45:30' },
    }
    expect(classifyItemMediaType(item)).toBe('audio')
  })

  it('classifyItemMediaType: media:content medium=video → video', () => {
    const item = {
      link: 'https://example.com/vid2',
      guid: 'vid2',
      media: { contents: [{ url: 'https://cdn.example.com/vid2.mp4', medium: 'video' }] },
    }
    expect(classifyItemMediaType(item)).toBe('video')
  })

  it('classifyItemMediaType: plain article → article', () => {
    const item = {
      link: 'https://example.com/article1',
      guid: 'article1',
      title: 'Just a blog post',
      description: 'No media here',
    }
    expect(classifyItemMediaType(item)).toBe('article')
  })

  it('classifyItemMediaType: no enclosure type → article', () => {
    const item = {
      link: 'https://example.com/noenclosure',
      guid: 'noenclosure',
      enclosures: [],
    }
    expect(classifyItemMediaType(item)).toBe('article')
  })

  // --- extractEnclosure ---

  it('extractEnclosure: returns first audio enclosure', () => {
    const item = {
      enclosures: [
        { url: 'https://cdn.example.com/ep.mp3', type: 'audio/mpeg', length: '50000000' },
      ],
    }
    const enc = extractEnclosure(item)
    expect(enc).not.toBeNull()
    expect(enc!.url).toBe('https://cdn.example.com/ep.mp3')
    expect(enc!.type).toBe('audio/mpeg')
  })

  it('extractEnclosure: returns null for empty enclosures', () => {
    expect(extractEnclosure({ enclosures: [] })).toBeNull()
  })

  it('extractEnclosure: returns null with no enclosures key', () => {
    expect(extractEnclosure({ link: 'https://example.com' })).toBeNull()
  })

  // --- extractVideoId ---

  it('extractVideoId: gets id from yt.videoId', () => {
    const item = { yt: { videoId: 'abc123' } }
    expect(extractVideoId(item)).toBe('abc123')
  })

  it('extractVideoId: gets id from yt:videoId key', () => {
    const item = { 'yt:videoId': 'def456' }
    expect(extractVideoId(item)).toBe('def456')
  })

  it('extractVideoId: returns null with no yt namespace', () => {
    const item = { link: 'https://vimeo.com/12345' }
    expect(extractVideoId(item)).toBeNull()
  })

  // --- parseDuration ---

  it('parseDuration: HH:MM:SS format', () => {
    expect(parseDuration('1:23:45')).toBe(5025) // 3600 + 23*60 + 45
  })

  it('parseDuration: MM:SS format', () => {
    expect(parseDuration('45:30')).toBe(2730)
  })

  it('parseDuration: plain number string', () => {
    expect(parseDuration('3600')).toBe(3600)
  })

  it('parseDuration: plain number', () => {
    expect(parseDuration(1800)).toBe(1800)
  })

  it('parseDuration: 0 returns 0', () => {
    expect(parseDuration('0')).toBe(0)
  })

  it('parseDuration: null returns null', () => {
    expect(parseDuration(null)).toBeNull()
  })

  it('parseDuration: undefined returns null', () => {
    expect(parseDuration(undefined)).toBeNull()
  })

  it('parseDuration: invalid string returns null', () => {
    expect(parseDuration('not-a-duration')).toBeNull()
  })

  // --- extractDuration ---

  it('extractDuration: gets duration from itunes namespace', () => {
    const item = { itunes: { duration: '30:00' } }
    expect(extractDuration(item)).toBe(1800)
  })

  it('extractDuration: returns null with no itunes', () => {
    expect(extractDuration({ link: 'https://example.com' })).toBeNull()
  })

  // --- extractThumbnail ---

  it('extractThumbnail: gets url from itunes.image', () => {
    const item = { itunes: { image: 'https://example.com/art.jpg' } }
    expect(extractThumbnail(item)).toBe('https://example.com/art.jpg')
  })

  it('extractThumbnail: gets url from media.thumbnails', () => {
    const item = {
      media: { thumbnails: [{ url: 'https://img.youtube.com/vi/abc/maxresdefault.jpg' }] },
    }
    expect(extractThumbnail(item)).toBe('https://img.youtube.com/vi/abc/maxresdefault.jpg')
  })

  it('extractThumbnail: gets url from media.groups[0].thumbnails (YouTube Atom pattern)', () => {
    const item = {
      media: {
        groups: [{ thumbnails: [{ url: 'https://i4.ytimg.com/vi/abc/hqdefault.jpg' }] }],
      },
    }
    expect(extractThumbnail(item)).toBe('https://i4.ytimg.com/vi/abc/hqdefault.jpg')
  })

  it('extractThumbnail: gets url from media.group.thumbnails (deprecated single group)', () => {
    const item = {
      media: {
        group: { thumbnails: [{ url: 'https://i4.ytimg.com/vi/abc/hqdefault.jpg' }] },
      },
    }
    expect(extractThumbnail(item)).toBe('https://i4.ytimg.com/vi/abc/hqdefault.jpg')
  })

  it('extractThumbnail: returns null with no media metadata', () => {
    expect(extractThumbnail({ title: 'No thumbnail' })).toBeNull()
  })

  // --- classifyFeedType ---

  it('classifyFeedType: all articles → article', () => {
    const items = [
      { media_type: 'article' as const },
      { media_type: 'article' as const },
      { media_type: 'article' as const },
    ]
    expect(classifyFeedType(items)).toBe('article')
  })

  it('classifyFeedType: all audio → podcast', () => {
    const items = [{ media_type: 'audio' as const }, { media_type: 'audio' as const }]
    expect(classifyFeedType(items)).toBe('podcast')
  })

  it('classifyFeedType: all video → video', () => {
    const items = [
      { media_type: 'video' as const },
      { media_type: 'video' as const },
      { media_type: 'video' as const },
    ]
    expect(classifyFeedType(items)).toBe('video')
  })

  it('classifyFeedType: mixed types → mixed', () => {
    const items = [{ media_type: 'article' as const }, { media_type: 'audio' as const }]
    expect(classifyFeedType(items)).toBe('mixed')
  })

  it('classifyFeedType: empty items → article', () => {
    expect(classifyFeedType([])).toBe('article')
  })

  // --- extractFirstImageSrc ---

  it('extractFirstImageSrc: returns src from first img with double-quoted src', () => {
    const html = '<p><img src="https://example.com/photo.jpg" alt="photo"></p>'
    expect(extractFirstImageSrc(html)).toBe('https://example.com/photo.jpg')
  })

  it('extractFirstImageSrc: returns src from first img with single-quoted src', () => {
    const html = "<img src='https://example.com/photo.png'>"
    expect(extractFirstImageSrc(html)).toBe('https://example.com/photo.png')
  })

  it('extractFirstImageSrc: returns the first src when multiple imgs are present', () => {
    const html = '<img src="https://first.com/a.jpg"><img src="https://second.com/b.jpg">'
    expect(extractFirstImageSrc(html)).toBe('https://first.com/a.jpg')
  })

  it('extractFirstImageSrc: returns null when no img tag is present', () => {
    expect(extractFirstImageSrc('<p>No images here.</p>')).toBeNull()
  })

  it('extractFirstImageSrc: returns null for empty string', () => {
    expect(extractFirstImageSrc('')).toBeNull()
  })

  it('extractFirstImageSrc: returns null for relative src', () => {
    const html = '<img src="/relative/path.jpg">'
    expect(extractFirstImageSrc(html)).toBeNull()
  })

  it('extractFirstImageSrc: returns null for protocol-relative src', () => {
    const html = '<img src="//example.com/img.jpg">'
    expect(extractFirstImageSrc(html)).toBeNull()
  })

  it('extractFirstImageSrc: handles img nested inside other elements', () => {
    const html =
      '<article><section><figure><img src="https://cdn.example.com/hero.jpg" /></figure></section></article>'
    expect(extractFirstImageSrc(html)).toBe('https://cdn.example.com/hero.jpg')
  })
})
