import { describe, expect, it } from 'vitest'
import { isYouTubeChannelFeedUrl } from './urls.mts'

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
