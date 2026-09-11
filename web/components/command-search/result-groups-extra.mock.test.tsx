import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CommunityResults,
  DomainResults,
  FediverseResults,
  NewsResults,
} from '../command-search/result-groups-extra'
import { EMPTY_RESULTS, type SearchResults } from '../command-search-data'

vi.mock(
  import('@/components/ui/command'),
  () =>
    ({
      CommandGroup: ({
        children,
        heading,
        ...props
      }: {
        children: React.ReactNode
        heading: string
      }) => (
        <section
          aria-label={heading}
          {...props}
        >
          {children}
        </section>
      ),
      CommandItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    }) as unknown as typeof import('@/components/ui/command'),
)

vi.mock(import('../command-search/command-link-item'), () => ({
  CommandLinkItem: ({
    href,
    label,
    onOpenChange,
    pushRoute,
  }: {
    href: string
    external: boolean
    label: import('../command-search/command-link-item').CommandItemLabel
    sublabel: string
    onOpenChange: (open: boolean) => void
    pushRoute?: (href: string) => void
  }) => (
    <button
      type='button'
      data-href={href}
      onClick={() => {
        pushRoute?.(href)
        onOpenChange(false)
      }}
    >
      {label.kind === 'ui-text' ? label.text : label.content.text}
    </button>
  ),
}))

function makeResults(overrides: Partial<SearchResults>): SearchResults {
  return { ...EMPTY_RESULTS, ...overrides }
}

describe('extra command search result groups', () => {
  it('passes news results with outbound UTM href to CommandLinkItem and closes the dialog', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()

    render(
      <NewsResults
        activeTab='news'
        onOpenChange={onOpenChange}
        results={makeResults({
          news: [
            {
              id: 'news-1',
              url: { url: 'https://example.com/article' },
              data: { title: 'Tom &amp; Jerry' },
              rss_feed: { title: 'Daily Feed' },
            },
          ],
        } as Partial<SearchResults>)}
      />,
    )

    const button = screen.getByText('Tom & Jerry').closest('button')
    expect(button).toHaveAttribute(
      'data-href',
      expect.stringContaining('https://example.com/article?utm_source=voucha'),
    )
    fireEvent.click(button!)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('routes community results and closes the dialog', () => {
    const pushRoute = vi.fn<(href: string) => void>()
    const onOpenChange = vi.fn<(open: boolean) => void>()

    render(
      <CommunityResults
        activeTab='all'
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
        results={makeResults({
          communities: [{ id: 'community-1', slug: 'test-community', name: 'Test Community' }],
        } as Partial<SearchResults>)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /test community/i }))

    expect(pushRoute).toHaveBeenCalledWith('/communities/test-community')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('routes domain results and closes the dialog', () => {
    const pushRoute = vi.fn<(href: string) => void>()
    const onOpenChange = vi.fn<(open: boolean) => void>()

    render(
      <DomainResults
        activeTab='all'
        onOpenChange={onOpenChange}
        pushRoute={pushRoute}
        results={makeResults({
          domains: [{ id: 'domain-1', hostname: 'example.com' }],
        } as Partial<SearchResults>)}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /example\.com/i }))

    expect(pushRoute).toHaveBeenCalledWith('/domain/example.com')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('renders Fediverse results with provider label and outbound UTM href', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>()

    render(
      <FediverseResults
        activeTab='fediverse'
        onOpenChange={onOpenChange}
        results={makeResults({
          fediverse: [
            {
              provider: 'peertube',
              result_type: 'video',
              external_url: 'https://videos.example/watch/1',
              title: 'Test Video',
              summary: 'A video result',
              author_name: 'Alice',
              author_url: 'https://videos.example/accounts/alice',
              published_at: '2026-07-09T12:34:56Z',
              source_hostname: 'videos.example',
            },
            {
              provider: 'bluesky',
              result_type: 'post',
              external_url: 'https://social.example/post/1',
              title: 'Test Post',
              summary: 'A post result',
              author_name: null,
              author_url: null,
              published_at: null,
              source_hostname: 'social.example',
            },
            {
              provider: 'mastodon',
              result_type: 'post',
              external_url: 'javascript:alert(1)',
              title: 'Unsafe Post',
              summary: null,
              author_name: null,
              author_url: null,
              published_at: null,
              source_hostname: 'social.example',
            },
          ],
        } as Partial<SearchResults>)}
      />,
    )

    const videoButton = screen.getByRole('button', { name: /test video/i })
    expect(videoButton).toHaveAttribute(
      'data-href',
      expect.stringContaining('https://videos.example/watch/1?utm_source=voucha'),
    )
    expect(screen.getByRole('button', { name: /test post/i })).toHaveAttribute(
      'data-href',
      expect.stringContaining('https://social.example/post/1?utm_source=voucha'),
    )
    expect(screen.getByText('Unsafe Post')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /unsafe post/i })).not.toBeInTheDocument()
    fireEvent.click(videoButton)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
