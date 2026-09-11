import { describe, expect, it } from 'vitest'
import { mapPeerTubeChannel, mapPeerTubeVideo } from './peertube.mts'

describe('mapPeerTubeVideo', () => {
  it('maps a video with account, thumbnail, and canonical url', () => {
    const result = mapPeerTubeVideo({
      uuid: 'abc-123',
      name: 'My Video',
      description: 'A video about things',
      thumbnailPath: '/lazy-static/thumbnails/abc.jpg',
      publishedAt: '2026-01-01T00:00:00.000Z',
      url: 'https://origin.example/videos/watch/abc-123',
      account: {
        name: 'creator',
        displayName: 'Creator Name',
        host: 'origin.example',
        url: 'https://origin.example/accounts/creator',
      },
    })

    expect(result).toEqual({
      provider: 'peertube',
      result_type: 'video',
      source_hostname: 'origin.example',
      external_url: 'https://origin.example/videos/watch/abc-123',
      title: 'My Video',
      summary: 'A video about things',
      author_name: 'Creator Name',
      author_url: 'https://origin.example/accounts/creator',
      published_at: '2026-01-01T00:00:00.000Z',
      thumbnail_url: 'https://origin.example/lazy-static/thumbnails/abc.jpg',
    })
  })

  it('falls back to a constructed url and channel host when account/url are missing', () => {
    const result = mapPeerTubeVideo({
      uuid: 'xyz-789',
      name: 'Channel Video',
      channel: { name: 'chan', host: 'channel.example' },
    })

    expect(result.external_url).toBe('https://channel.example/videos/watch/xyz-789')
    expect(result.source_hostname).toBe('channel.example')
    expect(result.summary).toBe('')
    expect(result.author_name).toBeNull()
    expect(result.author_url).toBeNull()
    expect(result.published_at).toBeNull()
    expect(result.thumbnail_url).toBeNull()
  })
})

describe('mapPeerTubeChannel', () => {
  it('maps a channel with avatar and displayName', () => {
    const result = mapPeerTubeChannel({
      name: 'chan',
      displayName: 'Channel Display',
      description: 'A channel',
      host: 'channel.example',
      url: 'https://channel.example/video-channels/chan',
      avatar: { path: '/lazy-static/avatars/chan.png' },
    })

    expect(result).toEqual({
      provider: 'peertube',
      result_type: 'profile',
      source_hostname: 'channel.example',
      external_url: 'https://channel.example/video-channels/chan',
      title: 'Channel Display',
      summary: 'A channel',
      author_name: 'Channel Display',
      author_url: 'https://channel.example/video-channels/chan',
      published_at: null,
      thumbnail_url: 'https://channel.example/lazy-static/avatars/chan.png',
    })
  })

  it('falls back to name and a constructed url when displayName/url/avatar are missing', () => {
    const result = mapPeerTubeChannel({ name: 'chan', host: 'channel.example' })

    expect(result.title).toBe('chan')
    expect(result.author_name).toBe('chan')
    expect(result.external_url).toBe('https://channel.example/video-channels/chan')
    expect(result.summary).toBe('')
    expect(result.thumbnail_url).toBeNull()
  })
})
