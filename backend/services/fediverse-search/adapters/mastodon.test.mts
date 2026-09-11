import { describe, expect, it } from 'vitest'
import { mapMastodonAccount } from './mastodon.mts'

describe('mapMastodonAccount', () => {
  it('maps an account, stripping HTML from the note and using its own url hostname', () => {
    const result = mapMastodonAccount(
      {
        username: 'alice',
        display_name: 'Alice',
        url: 'https://mastodon.example/@alice',
        avatar: 'https://mastodon.example/avatars/alice.png',
        note: '<p>Hello <b>world</b></p>',
        created_at: '2026-01-01T00:00:00.000Z',
      },
      'fallback.example',
    )

    expect(result).toEqual({
      provider: 'mastodon',
      result_type: 'profile',
      source_hostname: 'mastodon.example',
      external_url: 'https://mastodon.example/@alice',
      title: 'Alice',
      summary: 'Hello world',
      author_name: 'Alice',
      author_url: 'https://mastodon.example/@alice',
      published_at: '2026-01-01T00:00:00.000Z',
      thumbnail_url: 'https://mastodon.example/avatars/alice.png',
    })
  })

  it('falls back to username and the configured host when display_name/note/avatar/url are missing', () => {
    const result = mapMastodonAccount(
      { username: 'bob', url: 'not-a-valid-url' },
      'fallback.example',
    )

    expect(result.title).toBe('bob')
    expect(result.author_name).toBe('bob')
    expect(result.source_hostname).toBe('fallback.example')
    expect(result.summary).toBe('')
    expect(result.published_at).toBeNull()
    expect(result.thumbnail_url).toBeNull()
  })
})
