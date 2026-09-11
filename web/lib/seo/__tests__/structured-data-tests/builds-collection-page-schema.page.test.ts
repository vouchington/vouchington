import { describe, expect, it } from 'vitest'
import {
  createBreadcrumbSchema,
  createCollectionPageSchema,
  createCommunityPageSchema,
  createOrganizationSchema,
  createSiteNavigationSchema,
  serializeStructuredData,
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

  it('omits description when not provided in community page schema', () => {
    const schema = createCommunityPageSchema({
      name: 'Points & Miles',
      path: '/communities/points-and-miles',
    })

    expect(schema['@type']).toBe('WebPage')
    expect(schema).not.toHaveProperty('description')
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

  it('escapes unsafe characters when serializing', () => {
    const json = serializeStructuredData({
      '@context': 'https://schema.org',
      name: 'A < B',
    })

    expect(json).toContain(String.raw`\u003c`)
  })

  it('builds breadcrumb schema with correct positions', () => {
    const schema = createBreadcrumbSchema([
      { name: 'Home', path: '/' },
      { name: 'Reviews', path: '/reviews' },
      { name: 'Amex Gold', path: '/review/amex-gold' },
    ])

    expect(schema['@type']).toBe('BreadcrumbList')
    const items = schema.itemListElement as Array<{ position: number; name: string }>
    expect(items).toHaveLength(3)
    expect(items[0]!.position).toBe(1)
    expect(items[1]!.position).toBe(2)
    expect(items[2]!.position).toBe(3)
    expect(items[0]!.name).toBe('Home')
    expect(items[2]!.name).toBe('Amex Gold')
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

  it('omits alternateName when displayName equals username', () => {
    const schema = createProfilePageSchema({
      username: 'johndoe',
      displayName: 'johndoe',
      path: '/user/johndoe',
      identifier: 'user-123',
    })

    expect(schema.mainEntity).not.toHaveProperty('alternateName')
  })

  it('omits image when imagePath not provided', () => {
    const schema = createProfilePageSchema({
      username: 'johndoe',
      displayName: 'John Doe',
      path: '/user/johndoe',
      identifier: 'user-123',
    })

    expect(schema.mainEntity).not.toHaveProperty('image')
  })

  it('uses username as name when displayName not provided', () => {
    const schema = createProfilePageSchema({
      username: 'johndoe',
      path: '/user/johndoe',
      identifier: 'user-123',
    })

    expect((schema.mainEntity as Record<string, unknown>).name).toBe('johndoe')
    expect(schema.mainEntity).not.toHaveProperty('alternateName')
  })

  it('omits dateCreated when not provided', () => {
    const schema = createProfilePageSchema({
      username: 'johndoe',
      displayName: 'John Doe',
      path: '/user/johndoe',
      identifier: 'user-123',
    })

    expect(schema).not.toHaveProperty('dateCreated')
  })
})
