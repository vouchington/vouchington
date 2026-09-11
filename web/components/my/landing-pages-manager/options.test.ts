import { describe, expect, it } from 'vitest'
import { toLandingPageItemInput } from './options'
import type { LandingPageItem } from '@/types/landing-pages'

describe('toLandingPageItemInput', () => {
  it('converts a link item to LandingPageItemInput', () => {
    const item: LandingPageItem = {
      id: '123',
      type: 'link',
      label: 'My Website',
      url: 'https://example.com',
    }

    const result = toLandingPageItemInput(item)

    expect(result).toEqual({ type: 'link', label: 'My Website', url: 'https://example.com' })
  })

  it('converts a profile_link item to LandingPageItemInput', () => {
    const item: LandingPageItem = {
      id: '456',
      type: 'profile_link',
      profile_link: {
        id: 'pl-1',
        user_id: 'user-1',
        link_type: 'url',
        sort_order: 0,
        url: null,
        handle: null,
        name: 'GitHub',
        image_id: null,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    }

    const result = toLandingPageItemInput(item)

    expect(result).toEqual({ type: 'profile_link', profile_link_id: 'pl-1' })
  })
})
