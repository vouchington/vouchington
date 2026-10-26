import { describe, expect, it } from 'vitest'
import {
  createCollectionPageSchema,
  createCommunityPageSchema,
  createOrganizationSchema,
  createSiteNavigationSchema,
} from '../../structured-data'
import { createProfilePageSchema } from '../../profile-page-schema'
import { PUBLIC_NAV_ITEMS } from '@/lib/navigation/public-nav'

describe('structured data helpers — page schemas', () => {
  it('builds collection page schema', () => {
    const schema = createCollectionPageSchema({
      title: 'Reviews',
      description: 'User reviews and ratings',
      path: '/reviews',
    })

    expect(schema['@type']).toBe('CollectionPage')
    expect(schema.url).toBe('https://voucha.ai/reviews')
  })

  it('builds community page schema', () => {
    const schema = createCommunityPageSchema({
      name: 'Points & Miles',
      description: 'Discussion about travel rewards',
      path: '/communities/points-and-miles',
    })

    expect(schema['@type']).toBe('WebPage')
    expect(schema.name).toBe('Points & Miles')
    expect(schema.description).toBe('Discussion about travel rewards')
    expect(schema.url).toBe('https://voucha.ai/communities/points-and-miles')
    expect(schema.isPartOf).toMatchObject({
      '@type': 'WebSite',
      name: 'Voucha',
      url: 'https://voucha.ai/',
    })
  })

  it('builds organization schema', () => {
    const schema = createOrganizationSchema()

    expect(schema['@type']).toBe('Organization')
    expect(schema.url).toBe('https://voucha.ai/')
  })

  it('builds site navigation schema from the shared public nav config', () => {
    const schema = createSiteNavigationSchema(
      PUBLIC_NAV_ITEMS.map(item => ({ name: item.label, path: item.href })),
    )

    expect(schema['@type']).toBe('SiteNavigationElement')
    expect(schema.name).toBe('Primary navigation')
    expect(schema.hasPart).toEqual(
      PUBLIC_NAV_ITEMS.map(item => ({
        '@type': 'WebPage',
        name: item.label,
        url: `https://voucha.ai${item.href}`,
      })),
    )
  })

  it('builds profile page schema with display name and image', () => {
    const schema = createProfilePageSchema({
      username: 'johndoe',
      displayName: 'John Doe',
      path: '/user/johndoe',
      identifier: 'user-123',
      imagePath: '/images/prod/profile-image-456',
      dateCreated: '2025-01-15T00:00:00.000Z',
    })

    expect(schema['@type']).toBe('ProfilePage')
    expect(schema.url).toBe('https://voucha.ai/user/johndoe')
    expect(schema.dateCreated).toBe('2025-01-15T00:00:00.000Z')
    expect(schema.mainEntity).toMatchObject({
      '@type': 'Person',
      name: 'John Doe',
      identifier: 'user-123',
      url: 'https://voucha.ai/user/johndoe',
      alternateName: 'johndoe',
      image: 'https://voucha.ai/images/prod/profile-image-456',
    })
  })
})
