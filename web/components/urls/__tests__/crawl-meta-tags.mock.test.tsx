import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { CrawlMetaTags } from '../crawl-meta-tags'

vi.mock(
  import('@/components/shared/proxied-image'),
  () =>
    ({
      ProxiedImage: ({ src, alt }: { src: string; alt: string }) => (
        <span
          data-testid='mock-image'
          data-src={src}
          aria-label={alt || undefined}
        />
      ),
    }) as unknown as typeof import('@/components/shared/proxied-image'),
)

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        ...props
      }: {
        children: ReactNode
        href: string
        [k: string]: unknown
      }) => (
        <a
          href={href}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

describe('CrawlMetaTags', () => {
  it('renders nothing when meta is empty', async () => {
    const { container } = render(
      await CrawlMetaTags({
        meta: {},
        lang: null,
      }),
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders when meta is empty but lang is present', async () => {
    const { container } = render(
      await CrawlMetaTags({
        meta: {},
        lang: 'fr',
      }),
    )
    expect(container.firstChild).not.toBeNull()
    expect(screen.getByText('fr')).toBeInTheDocument()
  })

  it('renders a normalized provider and source when raw metadata is empty', async () => {
    render(
      await CrawlMetaTags({
        meta: {},
        lang: null,
        embedMetadata: {
          kind: 'article',
          requestedUrl: 'https://example.com/requested',
          resolvedUrl: 'https://example.com/resolved',
          title: null,
          description: null,
          author: null,
          provider: { key: 'example', name: 'Example', url: null, resourceId: null },
          thumbnail: null,
          player: null,
        },
      }),
    )

    expect(screen.getByText('Example')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open source' })).toHaveAttribute(
      'href',
      'https://example.com/resolved',
    )
  })

  it('renders featured og:image from ogImageSideload, description, and lang when present', async () => {
    const sideloadUrl = '/sideload/aHR0cHM6Ly9leGFtcGxlLmNvbS9pbWcucG5n?w=400'
    render(
      await CrawlMetaTags({
        meta: {
          'og:image': 'https://example.com/img.png',
          description: 'A test description',
        },
        lang: 'en',
        ogImageSideload: sideloadUrl,
      }),
    )

    const img = screen.getByTestId('mock-image')
    expect(img).toHaveAttribute('data-src', sideloadUrl)
    expect(screen.getAllByText('A test description')).toHaveLength(2)
    expect(screen.getByText('en')).toBeInTheDocument()
  })

  it('does not render og:image when ogImageSideload is absent even if og:image is in meta', async () => {
    render(
      await CrawlMetaTags({
        meta: { 'og:image': 'https://example.com/img.png', description: 'Desc' },
        lang: null,
      }),
    )
    expect(screen.queryByTestId('mock-image')).toBeNull()
  })

  it('falls back to og:description when description is absent', async () => {
    render(
      await CrawlMetaTags({
        meta: {
          'og:description': 'OG fallback description',
        },
        lang: null,
      }),
    )

    // Falls back to og:description for the featured row; also appears in the full table
    expect(screen.getAllByText('OG fallback description')).toHaveLength(2)
  })

  it('prefers description over og:description', async () => {
    render(
      await CrawlMetaTags({
        meta: {
          description: 'Primary description',
          'og:description': 'OG fallback description',
        },
        lang: null,
      }),
    )

    // Primary description appears in featured row + full table = 2 times
    // The selected preview prefers OG metadata; the complete raw map preserves both values.
    expect(screen.getAllByText('Primary description')).toHaveLength(1)
    expect(screen.getAllByText('OG fallback description')).toHaveLength(2)
  })

  it('alphabetizes the full table rows', async () => {
    render(
      await CrawlMetaTags({
        meta: {
          viewport: 'width=device-width',
          author: 'Jane Doe',
          canonical: 'https://example.com',
        },
        lang: null,
      }),
    )

    // Find the dt elements in the "All Meta Tags" section (the xs font ones)
    const smallDts = [...document.querySelectorAll('dt.text-xs')]
    const keys = smallDts.map(dt => dt.textContent)
    expect(keys).toEqual(keys.toSorted())
  })

  it('renders only the full table when only unknown tags are present', async () => {
    render(
      await CrawlMetaTags({
        meta: {
          'x-custom-tag': 'custom value',
          'another-tag': 'another value',
        },
        lang: null,
      }),
    )

    // No featured row should render (no og:image/description/canonical/lang etc.)
    expect(screen.queryByTestId('mock-image')).toBeNull()
    // But the full table should contain the keys
    expect(screen.getByText('x-custom-tag')).toBeInTheDocument()
    expect(screen.getByText('another-tag')).toBeInTheDocument()
  })

  it('renders robots, viewport, and theme-color in the featured row when present', async () => {
    render(
      await CrawlMetaTags({
        meta: {
          robots: 'noindex, nofollow',
          viewport: 'width=device-width, initial-scale=1',
          'theme-color': '#ffffff',
        },
        lang: null,
      }),
    )

    // Each value appears in both featured row and full table = 2 times each
    expect(screen.getAllByText('noindex, nofollow')).toHaveLength(2)
    expect(screen.getAllByText('width=device-width, initial-scale=1')).toHaveLength(2)
    expect(screen.getAllByText('#ffffff')).toHaveLength(2)
  })
})
