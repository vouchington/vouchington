import { describe, expect, it } from 'vitest'
import {
  getProfileLinkHref,
  getProfileLinkLabel,
  resolveProfileLinkUrls,
} from '../profile-link-href'
import type { ProfileLink } from '@/types/user'

function makeLink(overrides: Partial<ProfileLink> = {}): ProfileLink {
  return {
    id: crypto.randomUUID(),
    user_id: 'user-1',
    link_type: 'url',
    sort_order: 0,
    url: null,
    handle: null,
    name: null,
    image_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('getProfileLinkHref', () => {
  it.each([
    ['twitter', 'jongle', 'https://x.com/jongle'],
    ['facebook', 'jongle', 'https://facebook.com/jongle'],
    ['instagram', 'jongle', 'https://instagram.com/jongle'],
    ['github', 'jongle', 'https://github.com/jongle'],
    ['linkedin', 'jongle', 'https://linkedin.com/in/jongle'],
    ['youtube', 'jongle', 'https://youtube.com/@jongle'],
    ['tiktok', 'jongle', 'https://tiktok.com/@jongle'],
  ] as const)('%s with handle returns expected URL', (linkType, handle, expected) => {
    expect(getProfileLinkHref({ link_type: linkType, handle })).toBe(expected)
  })

  it('url type with url field returns the url', () => {
    expect(getProfileLinkHref({ link_type: 'url', url: 'https://example.com' })).toBe(
      'https://example.com',
    )
  })

  it('returns null when handle is missing for social types', () => {
    expect(getProfileLinkHref({ link_type: 'twitter', handle: null })).toBeNull()
  })

  it('returns null when url is missing for url type', () => {
    expect(getProfileLinkHref({ link_type: 'url', url: null })).toBeNull()
  })
})

describe('getProfileLinkLabel', () => {
  it('prefers name over handle over url', () => {
    expect(getProfileLinkLabel({ name: 'My Blog', handle: 'jongle', url: 'https://x.com' })).toBe(
      'My Blog',
    )
  })

  it('falls back to handle when no name', () => {
    expect(getProfileLinkLabel({ name: null, handle: 'jongle', url: 'https://x.com' })).toBe(
      'jongle',
    )
  })

  it('falls back to url when no name or handle', () => {
    expect(getProfileLinkLabel({ name: null, handle: null, url: 'https://example.com' })).toBe(
      'https://example.com',
    )
  })

  it('returns Profile link when all fields empty', () => {
    expect(getProfileLinkLabel({ name: null, handle: null, url: null })).toBe('Profile link')
  })
})

describe('resolveProfileLinkUrls', () => {
  it('returns an array of resolved hrefs, excluding nulls', () => {
    const links = [
      makeLink({ link_type: 'twitter', handle: 'jongle' }),
      makeLink({ link_type: 'twitter', handle: null }),
      makeLink({ link_type: 'url', url: 'https://blog.example.com' }),
    ]

    expect(resolveProfileLinkUrls(links)).toEqual([
      'https://x.com/jongle',
      'https://blog.example.com',
    ])
  })
})
