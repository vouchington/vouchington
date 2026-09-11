import { describe, expect, it } from 'vitest'
import {
  createExcerpt,
  createNoIndexMetadata,
  createPageMetadata,
  createRootMetadata,
} from '../metadata'
import { OG_RENDERER_VERSION } from '../og-image-url'

const GENERIC_OG_PARAMS = {
  type: 'generic',
  eyebrow: 'Community Intelligence',
  title: 'Voucha',
  description:
    'Voucha is a social trust network — news, reviews, and recommendations from the people and sources you actually trust.',
  domainLabel: 'voucha.ai',
}

/** Decode the `/og/<base64url>` segment of a signed OG image URL back to its params. */
function decodeOgImageParams(url: string): unknown {
  const path = new URL(url).pathname
  const encoded = path.replace(/^\/og\//, '')
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
}

describe('seo metadata helpers', () => {
  it('builds root metadata with the generic signed OG/Twitter card', () => {
    const metadata = createRootMetadata()

    expect(metadata.icons).toMatchObject({
      icon: expect.arrayContaining([
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ]),
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    })
    const ogImages = metadata.openGraph?.images
    expect(Array.isArray(ogImages) && ogImages.length === 1).toBe(true)
    const [{ url, width, height }] = ogImages as [{ url: string; width: number; height: number }]
    expect(url).toMatch(/^https:\/\/voucha\.ai\/og\/[A-Za-z0-9_-]+\?sig=/)
    expect(width).toBe(1200)
    expect(height).toBe(630)
    expect(decodeOgImageParams(url)).toEqual({
      ...GENERIC_OG_PARAMS,
      rendererVersion: OG_RENDERER_VERSION,
    })

    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', images: [url] })
  })

  it('builds canonical metadata for public pages, falling back to the generic OG card', () => {
    const metadata = createPageMetadata({
      title: 'Reviews',
      description: 'User reviews and ratings',
      path: '/reviews',
    })

    expect(metadata.alternates?.canonical).toBe('/reviews')
    expect(metadata.openGraph?.url).toBe('https://voucha.ai/reviews')
    const ogImages = metadata.openGraph?.images
    expect(Array.isArray(ogImages) && ogImages.length === 1).toBe(true)
    const [{ url, width, height }] = ogImages as [{ url: string; width: number; height: number }]
    expect(url).toMatch(/^https:\/\/voucha\.ai\/og\/[A-Za-z0-9_-]+\?sig=/)
    expect(width).toBe(1200)
    expect(height).toBe(630)
    expect(decodeOgImageParams(url)).toEqual({
      ...GENERIC_OG_PARAMS,
      rendererVersion: OG_RENDERER_VERSION,
    })

    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image', images: [url] })
  })

  it('adds markdown alternate metadata for markdown-backed detail pages', () => {
    const metadata = createPageMetadata({
      title: 'A Review',
      path: '/review/a-review',
    })

    expect(metadata.alternates?.types).toMatchObject({
      'text/markdown': [{ url: '/review/a-review.md', title: 'A Review Markdown' }],
    })
  })

  it('omits markdown alternate metadata for noindex detail pages', () => {
    const metadata = createPageMetadata({
      title: 'A Review',
      path: '/review/a-review',
      noIndex: true,
    })

    expect(metadata.alternates?.types).toBeUndefined()
  })

  it('includes article metadata when content details are provided', () => {
    const metadata = createPageMetadata({
      title: 'A Review',
      path: '/review/a-review',
      type: 'article',
      publishedTime: '2026-03-01T00:00:00.000Z',
      modifiedTime: '2026-03-02T00:00:00.000Z',
      authors: ['jong'],
      imagePath: '/images/dev/test?w=1200',
    })

    expect(metadata.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-03-01T00:00:00.000Z',
      modifiedTime: '2026-03-02T00:00:00.000Z',
      authors: ['jong'],
      images: [
        {
          url: 'https://voucha.ai/images/dev/test?w=1200',
          width: 1200,
          height: 630,
        },
      ],
    })
    expect(metadata.twitter).toMatchObject({
      images: ['https://voucha.ai/images/dev/test?w=1200'],
    })
  })

  it('marks noindex pages correctly', () => {
    const metadata = createNoIndexMetadata('Admin')

    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
    })
  })

  it('creates clean excerpts from markup-heavy content', () => {
    const excerpt = createExcerpt('<p>Hello <strong>world</strong></p>', 20)

    expect(excerpt).toBe('Hello world')
  })

  it('preserves mid-word hyphens in excerpts', () => {
    const excerpt = createExcerpt('A co-founder built this state-of-the-art product.', 100)

    expect(excerpt).toBe('A co-founder built this state-of-the-art product.')
  })
})
