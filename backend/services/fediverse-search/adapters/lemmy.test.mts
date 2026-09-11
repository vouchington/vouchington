import { describe, expect, it } from 'vitest'
import { mapLemmyCommunity, mapLemmyPerson, mapLemmyPost } from './lemmy.mts'

describe('mapLemmyPost', () => {
  it('maps a full post view', () => {
    const result = mapLemmyPost({
      post: {
        name: 'Hello Lemmy',
        body: 'Post body text',
        ap_id: 'https://lemmy.world/post/123',
        published: '2024-01-01T00:00:00.000Z',
        thumbnail_url: 'https://lemmy.world/thumb.jpg',
      },
      creator: {
        name: 'alice',
        display_name: 'Alice',
        actor_id: 'https://lemmy.world/u/alice',
      },
    })

    expect(result).toEqual({
      provider: 'lemmy',
      result_type: 'post',
      source_hostname: 'lemmy.world',
      external_url: 'https://lemmy.world/post/123',
      title: 'Hello Lemmy',
      summary: 'Post body text',
      author_name: 'Alice',
      author_url: 'https://lemmy.world/u/alice',
      published_at: '2024-01-01T00:00:00.000Z',
      thumbnail_url: 'https://lemmy.world/thumb.jpg',
    })
  })

  it('falls back to name and empty summary/thumbnail when optional fields are missing', () => {
    const result = mapLemmyPost({
      post: {
        name: 'No Body Post',
        ap_id: 'https://lemmy.world/post/456',
        published: '2024-01-02T00:00:00.000Z',
      },
      creator: {
        name: 'bob',
        actor_id: 'https://lemmy.world/u/bob',
      },
    })

    expect(result.summary).toBe('')
    expect(result.thumbnail_url).toBeNull()
    expect(result.author_name).toBe('bob')
  })
})

describe('mapLemmyPerson', () => {
  it('maps a full person view', () => {
    const result = mapLemmyPerson({
      person: {
        name: 'carol',
        display_name: 'Carol',
        bio: 'Bio text',
        actor_id: 'https://lemmy.world/u/carol',
        avatar: 'https://lemmy.world/avatar.jpg',
        published: '2024-01-03T00:00:00.000Z',
      },
    })

    expect(result).toEqual({
      provider: 'lemmy',
      result_type: 'profile',
      source_hostname: 'lemmy.world',
      external_url: 'https://lemmy.world/u/carol',
      title: 'Carol',
      summary: 'Bio text',
      author_name: 'Carol',
      author_url: 'https://lemmy.world/u/carol',
      published_at: '2024-01-03T00:00:00.000Z',
      thumbnail_url: 'https://lemmy.world/avatar.jpg',
    })
  })

  it('falls back to name and empty summary/thumbnail when optional fields are missing', () => {
    const result = mapLemmyPerson({
      person: {
        name: 'dave',
        actor_id: 'https://lemmy.world/u/dave',
        published: '2024-01-04T00:00:00.000Z',
      },
    })

    expect(result.title).toBe('dave')
    expect(result.author_name).toBe('dave')
    expect(result.summary).toBe('')
    expect(result.thumbnail_url).toBeNull()
  })
})

describe('mapLemmyCommunity', () => {
  it('maps a full community view', () => {
    const result = mapLemmyCommunity({
      community: {
        name: 'technology',
        title: 'Technology',
        description: 'All things tech',
        actor_id: 'https://lemmy.world/c/technology',
        icon: 'https://lemmy.world/icon.jpg',
        published: '2024-01-05T00:00:00.000Z',
      },
    })

    expect(result).toEqual({
      provider: 'lemmy',
      result_type: 'profile',
      source_hostname: 'lemmy.world',
      external_url: 'https://lemmy.world/c/technology',
      title: 'Technology',
      summary: 'All things tech',
      author_name: 'Technology',
      author_url: 'https://lemmy.world/c/technology',
      published_at: '2024-01-05T00:00:00.000Z',
      thumbnail_url: 'https://lemmy.world/icon.jpg',
    })
  })

  it('falls back to name and empty summary/thumbnail when optional fields are missing', () => {
    const result = mapLemmyCommunity({
      community: {
        name: 'science',
        actor_id: 'https://lemmy.world/c/science',
        published: '2024-01-06T00:00:00.000Z',
      },
    })

    expect(result.title).toBe('science')
    expect(result.author_name).toBe('science')
    expect(result.summary).toBe('')
    expect(result.thumbnail_url).toBeNull()
  })
})
