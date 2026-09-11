import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ImgHTMLAttributes } from 'react'
import { UrlEmbedRow } from './url-embed-row'

vi.mock(import('next/image'), () => {
  const Img = 'img' as const

  return {
    default: ({
      src,
      alt,
      width,
      height,
      className,
    }: ImgHTMLAttributes<HTMLImageElement> & { width?: number; height?: number }) => (
      <Img
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
      />
    ),
  } as unknown as typeof import('next/image')
})

describe('UrlEmbedRow', () => {
  it('renders crawl title and muted domain when crawl data is present', () => {
    render(
      <UrlEmbedRow
        url='https://www.techradar.com/post/article-123'
        latestCrawl={{ title: 'Great Tech Article', image_url: null }}
      />,
    )
    expect(screen.getByText('Great Tech Article')).toBeDefined()
    expect(screen.getByText('(techradar.com)')).toBeDefined()
  })

  it('renders thumbnail img when crawl has both title and image_url', () => {
    const { container } = render(
      <UrlEmbedRow
        url='https://www.techradar.com/post/article-123'
        latestCrawl={{
          title: 'Article',
          image_url: '/sideload/test-img.jpg',
        }}
      />,
    )
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img?.getAttribute('src')).toBe('/sideload/test-img.jpg')
  })

  it('does not render thumbnail when image_url is null', () => {
    const { container } = render(
      <UrlEmbedRow
        url='https://techradar.com/article'
        latestCrawl={{ title: 'Article', image_url: null }}
      />,
    )
    expect(container.querySelector('img')).toBeNull()
  })

  it('renders stripped url without www when no crawl data', () => {
    render(
      <UrlEmbedRow
        url='https://www.techradar.com/post/article-123'
        latestCrawl={null}
      />,
    )
    const link = screen.getByRole('link')
    expect(link.textContent).toContain('techradar.com')
    expect(link.textContent).not.toContain('www.')
  })

  it('renders stripped url path for fallback', () => {
    render(
      <UrlEmbedRow
        url='https://example.com/some/path'
        latestCrawl={undefined}
      />,
    )
    const link = screen.getByRole('link')
    expect(link.textContent).toContain('example.com/some/path')
  })

  it('strips www from domain in crawl title mode', () => {
    render(
      <UrlEmbedRow
        url='https://www.example.com/path'
        latestCrawl={{ title: 'Title', image_url: null }}
      />,
    )
    expect(screen.getByText('(example.com)')).toBeDefined()
  })

  it('fallback URL flex container has min-w-0 so truncate class can clip long paths', () => {
    const { container } = render(
      <UrlEmbedRow
        url='https://example.com/very/long/path/that/would/overflow'
        latestCrawl={null}
      />,
    )
    // The <p> wrapping the icon + URL span is the inner flex container that needs min-w-0
    const p = container.querySelector('p')
    expect(p).not.toBeNull()
    expect(p?.className).toContain('min-w-0')
  })

  it('opens link in new tab', () => {
    render(
      <UrlEmbedRow
        url='https://example.com'
        latestCrawl={null}
      />,
    )
    const link = screen.getByRole('link')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})
