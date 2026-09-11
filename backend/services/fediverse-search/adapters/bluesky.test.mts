import { describe, expect, it } from 'vitest'
import { mapBlueskyActor, mapBlueskyPost } from './bluesky.mts'

describe('mapBlueskyActor', () => {
  it('maps an actor with displayName, description, and avatar', () => {
    const result = mapBlueskyActor({
      did: 'did:plc:abc123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      description: 'Hello there',
      avatar: 'https://cdn.bsky.app/avatars/alice.png',
    })

    expect(result).toEqual({
      provider: 'bluesky',
      result_type: 'profile',
      source_hostname: 'bsky.app',
      external_url: 'https://bsky.app/profile/alice.bsky.social',
      title: 'Alice',
      summary: 'Hello there',
      author_name: 'Alice',
      author_url: 'https://bsky.app/profile/alice.bsky.social',
      published_at: null,
      thumbnail_url: 'https://cdn.bsky.app/avatars/alice.png',
    })
  })

  it('falls back to handle when displayName/description/avatar are missing', () => {
    const result = mapBlueskyActor({ did: 'did:plc:xyz789', handle: 'bob.bsky.social' })

    expect(result.title).toBe('bob.bsky.social')
    expect(result.author_name).toBe('bob.bsky.social')
    expect(result.summary).toBe('')
    expect(result.thumbnail_url).toBeNull()
  })
})

describe('mapBlueskyPost', () => {
  it('maps a post, deriving the rkey from the AT-URI and using record.createdAt', () => {
    const result = mapBlueskyPost({
      uri: 'at://did:plc:abc123/app.bsky.feed.post/3k2abc',
      author: { handle: 'alice.bsky.social', displayName: 'Alice' },
      record: { text: 'Hello world', createdAt: '2026-01-01T00:00:00.000Z' },
    })

    expect(result).toEqual({
      provider: 'bluesky',
      result_type: 'post',
      source_hostname: 'bsky.app',
      external_url: 'https://bsky.app/profile/alice.bsky.social/post/3k2abc',
      title: 'Hello world',
      summary: '',
      author_name: 'Alice',
      author_url: 'https://bsky.app/profile/alice.bsky.social',
      published_at: '2026-01-01T00:00:00.000Z',
      thumbnail_url: null,
    })
  })

  it('falls back to author handle and indexedAt when displayName/record.createdAt are missing', () => {
    const result = mapBlueskyPost({
      uri: 'at://did:plc:xyz789/app.bsky.feed.post/3k2def',
      author: { handle: 'bob.bsky.social' },
      record: { text: 'Another post' },
      indexedAt: '2026-01-02T00:00:00.000Z',
    })

    expect(result.author_name).toBe('bob.bsky.social')
    expect(result.published_at).toBe('2026-01-02T00:00:00.000Z')
  })
})
