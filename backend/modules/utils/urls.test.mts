import { describe, expect, it } from 'vitest'
import { getUrlIdentity, isYouTubeChannelFeedUrl, normalizeUrlForUrlTable } from './urls.mts'

describe('isYouTubeChannelFeedUrl', () => {
  it('returns true for canonical YouTube channel feed URL', () => {
    expect(
      isYouTubeChannelFeedUrl(
        'https://www.youtube.com/feeds/videos.xml?channel_id=UC4w1YQAJMWOz4qtxinq55LQ',
      ),
    ).toBe(true)
  })

  it('returns true for youtube.com host without www', () => {
    expect(isYouTubeChannelFeedUrl('https://youtube.com/feeds/videos.xml?channel_id=UCabc')).toBe(
      true,
    )
  })

  it('returns false for a YouTube watch URL', () => {
    expect(isYouTubeChannelFeedUrl('https://www.youtube.com/watch?v=abc123')).toBe(false)
  })

  it('returns false for a YouTube handle URL', () => {
    expect(isYouTubeChannelFeedUrl('https://www.youtube.com/@TechWithNikola')).toBe(false)
  })

  it('returns false for a YouTube channel page URL', () => {
    expect(
      isYouTubeChannelFeedUrl('https://www.youtube.com/channel/UC4w1YQAJMWOz4qtxinq55LQ'),
    ).toBe(false)
  })

  it('returns false for a non-YouTube feed URL', () => {
    expect(isYouTubeChannelFeedUrl('https://feeds.npr.org/510289/podcast.xml')).toBe(false)
  })

  it('returns false for an empty string', () => {
    expect(isYouTubeChannelFeedUrl('')).toBe(false)
  })

  it('returns false for a non-URL string', () => {
    expect(isYouTubeChannelFeedUrl('not-a-url')).toBe(false)
  })
})

describe('normalizeUrlForUrlTable', () => {
  it('drops tracking params, credentials, default ports, fragments, and trailing slashes', () => {
    expect(
      normalizeUrlForUrlTable(
        'http://user:pass@Example.com:80/a/b/?utm_source=x&z=2&fbclid=y&a=1#top',
      ).href,
    ).toBe('https://example.com/a/b?a=1&z=2')
  })

  it('keeps the root path and content params', () => {
    expect(normalizeUrlForUrlTable('https://example.com/?utm_campaign=x').href).toBe(
      'https://example.com/',
    )
    expect(normalizeUrlForUrlTable('https://example.com/watch?v=abc&t=5').href).toBe(
      'https://example.com/watch?t=5&v=abc',
    )
  })

  it('keeps http only when asked and still rejects other schemes and bad URLs', () => {
    expect(normalizeUrlForUrlTable('http://example.com/a/', { preserveHttp: true }).href).toBe(
      'http://example.com/a',
    )
    expect(() => normalizeUrlForUrlTable('ftp://example.com/a')).toThrow(
      'URL must use http or https',
    )
    expect(() => normalizeUrlForUrlTable('not a url')).toThrow(TypeError)
  })
})

describe('getUrlIdentity', () => {
  it('shares one identity across scheme, www, m, and tracking variants', () => {
    const identity = getUrlIdentity('https://example.com/a?id=1')
    expect(getUrlIdentity('http://www.example.com/a/?id=1&utm_source=x')).toBe(identity)
    expect(getUrlIdentity('https://m.example.com/a?id=1')).toBe(identity)
    expect(getUrlIdentity('https://example.com/a?id=2')).not.toBe(identity)
  })

  it('rejects a value that is not an http(s) URL', () => {
    expect(() => getUrlIdentity('ftp://example.com/a')).toThrow(TypeError)
  })
})
