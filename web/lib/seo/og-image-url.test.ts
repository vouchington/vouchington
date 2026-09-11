import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { signPath } from '@ts-shared/url-signing'
import { TEST_SIDELOAD_SIGNING_KEY } from '@ts-shared/url-signing/test-key'
import {
  buildGenericOgImageUrl,
  buildLandingOgImageUrl,
  extractTopCategories,
  OG_RENDERER_VERSION,
} from './og-image-url'
import type { LandingPageItem, PublicLandingPage } from '@/types/landing-pages'

const GENERIC_PARAMS = {
  eyebrow: 'Community Intelligence',
  title: 'Voucha',
  description: 'Voucha is a social trust network.',
  domainLabel: 'voucha.ai',
}

function decodeOgPath(url: string): { pathname: string; params: unknown; sig: string | null } {
  const parsed = new URL(url)
  const encoded = parsed.pathname.replace(/^\/og\//, '')
  return {
    pathname: parsed.pathname,
    params: JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
    sig: parsed.searchParams.get('sig'),
  }
}

function buildLandingPage(items: LandingPageItem[]): PublicLandingPage {
  return {
    user: { id: 'user-1', roles: [], username: 'alice', display_name: 'Alice', markdown: '' },
    landing_page: {
      id: 'lp-1',
      user_id: 'user-1',
      title: 'Alice',
      subtitle: null,
      slug: 'alice',
      is_default: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      items,
    },
  }
}

function referralItem(id: string, referral_program_name: string): LandingPageItem {
  return {
    id,
    type: 'referral_link',
    referral_link: {
      id: `rl-${id}`,
      referral_program_id: `rp-${id}`,
      referral_program_name,
      referral_program_slug: referral_program_name.toLowerCase(),
      label: null,
      url: 'https://example.com',
    },
  }
}

function topicGroupItem(id: string, name: string): LandingPageItem {
  return {
    id,
    type: 'topic_group',
    topic: { id: `topic-${id}`, name, slug: name.toLowerCase(), topic_type: 'general' },
    entries: [],
  }
}

describe('buildGenericOgImageUrl / buildLandingOgImageUrl', () => {
  beforeEach(() => {
    vi.stubEnv('IMAGE_ORIGIN', 'https://images.example.com')
    vi.stubEnv('VOUCHA_SIDELOAD_SIGNING_KEYS', TEST_SIDELOAD_SIGNING_KEY)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds an absolute signed /og/ URL whose signature covers only the path', () => {
    const url = buildGenericOgImageUrl(GENERIC_PARAMS)
    const parsed = new URL(url)

    expect(parsed.origin).toBe('https://images.example.com')
    expect(parsed.pathname).toMatch(/^\/og\/[A-Za-z0-9_-]+$/)
    expect(parsed.searchParams.get('sig')).toBe(
      signPath(parsed.pathname, [TEST_SIDELOAD_SIGNING_KEY]),
    )
  })

  it('encodes the generic params verbatim into the base64url segment', () => {
    const url = buildGenericOgImageUrl(GENERIC_PARAMS)
    const { params } = decodeOgPath(url)

    expect(params).toEqual({
      type: 'generic',
      ...GENERIC_PARAMS,
      rendererVersion: OG_RENDERER_VERSION,
    })
  })

  it('encodes landing params, omitting avatarImageId when not provided', () => {
    const url = buildLandingOgImageUrl({
      displayName: 'Alice',
      username: 'alice',
      topCategories: ['Travel', 'Tech'],
    })
    const { params } = decodeOgPath(url)

    expect(params).toEqual({
      type: 'landing',
      displayName: 'Alice',
      username: 'alice',
      topCategories: ['Travel', 'Tech'],
      rendererVersion: OG_RENDERER_VERSION,
    })
  })

  it('includes avatarImageId when provided', () => {
    const url = buildLandingOgImageUrl({
      displayName: 'Alice',
      username: 'alice',
      topCategories: [],
      avatarImageId: 'img-1',
    })
    const { params } = decodeOgPath(url)

    expect(params).toMatchObject({ avatarImageId: 'img-1' })
  })

  it('truncates topCategories to a maximum of 5', () => {
    const url = buildLandingOgImageUrl({
      displayName: 'Alice',
      username: 'alice',
      topCategories: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    })
    const { params } = decodeOgPath(url)

    expect((params as { topCategories: string[] }).topCategories).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('produces a different base64url segment when params change', () => {
    const urlA = buildGenericOgImageUrl(GENERIC_PARAMS)
    const urlB = buildGenericOgImageUrl({ ...GENERIC_PARAMS, title: 'Different Title' })

    expect(new URL(urlA).pathname).not.toBe(new URL(urlB).pathname)
  })

  it('falls back to a relative /og/ path when IMAGE_ORIGIN is unset', () => {
    vi.stubEnv('IMAGE_ORIGIN', undefined)

    const url = buildGenericOgImageUrl(GENERIC_PARAMS)

    expect(url).toMatch(/^\/og\/[A-Za-z0-9_-]+\?sig=/)
  })

  it('signs with an empty signature when no signing keys are configured (dev mode)', () => {
    vi.stubEnv('VOUCHA_SIDELOAD_SIGNING_KEYS', undefined)

    const url = buildGenericOgImageUrl(GENERIC_PARAMS)

    expect(new URL(url).searchParams.get('sig')).toBe('')
  })
})

describe('extractTopCategories', () => {
  it('returns an empty array when there are no category-bearing items', () => {
    expect(extractTopCategories(buildLandingPage([]))).toEqual([])
  })

  it('ignores item types that do not carry a category', () => {
    const data = buildLandingPage([
      { id: '1', type: 'link', label: 'My Site', url: 'https://example.com' },
      {
        id: '2',
        type: 'profile_link',
        profile_link: {
          id: 'pl-1',
          user_id: 'user-1',
          link_type: 'url',
          sort_order: 0,
          url: 'https://example.com',
          handle: null,
          name: null,
          image_id: null,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
        },
      },
    ])

    expect(extractTopCategories(data)).toEqual([])
  })

  it('extracts referral_program_name from referral_link items', () => {
    const data = buildLandingPage([referralItem('1', 'Chase Sapphire')])

    expect(extractTopCategories(data)).toEqual(['Chase Sapphire'])
  })

  it('extracts topic name from topic_group items', () => {
    const data = buildLandingPage([topicGroupItem('1', 'Travel')])

    expect(extractTopCategories(data)).toEqual(['Travel'])
  })

  it('dedupes repeated category names across items', () => {
    const data = buildLandingPage([
      referralItem('1', 'Chase Sapphire'),
      referralItem('2', 'Chase Sapphire'),
      topicGroupItem('3', 'Chase Sapphire'),
    ])

    expect(extractTopCategories(data)).toEqual(['Chase Sapphire'])
  })

  it('caps at 5 categories, preserving item order', () => {
    const data = buildLandingPage([
      referralItem('1', 'One'),
      topicGroupItem('2', 'Two'),
      referralItem('3', 'Three'),
      topicGroupItem('4', 'Four'),
      referralItem('5', 'Five'),
      topicGroupItem('6', 'Six'),
    ])

    expect(extractTopCategories(data)).toEqual(['One', 'Two', 'Three', 'Four', 'Five'])
  })
})
