import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, configure } from '@testing-library/react'
import { HnDiscussionsAside } from './hn-discussions-aside'
import type { HnDiscussionThread } from '@/lib/hn-discussions/search'

configure({ testIdAttribute: 'data-pw' })

const searchMock = vi.hoisted(() =>
  vi.fn<(pageUrls: readonly string[]) => Promise<HnDiscussionThread[]>>(),
)

vi.mock(import('@/lib/hn-discussions/search'), async importOriginal => {
  const actual = await importOriginal()
  return {
    ...actual,
    searchHnDiscussionsForUrls: searchMock,
  }
})

vi.mock(
  import('@/lib/i18n/use-translations'),
  () =>
    ({
      useTranslations: () => (key: string, params?: Record<string, unknown>) => {
        if (key.includes('pointsPoints')) return `${String(params?.points ?? '')} points`
        if (key.includes('commentsComments')) return `${String(params?.comments ?? '')} comments`
        if (key.includes('hackerNews_')) return 'Hacker News'
        return key
      },
    }) as unknown as typeof import('@/lib/i18n/use-translations'),
)

describe('HnDiscussionsAside', () => {
  beforeEach(() => {
    searchMock.mockReset()
  })

  it('renders nothing when the preference is off', () => {
    render(
      <HnDiscussionsAside
        enabled={false}
        urls={['https://example.com/a']}
      />,
    )
    expect(searchMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('hn-discussions-aside')).not.toBeInTheDocument()
  })

  it('renders title, score, and comment count for matching threads', async () => {
    searchMock.mockResolvedValue([
      {
        objectID: '123',
        title: 'Example thread',
        score: 42,
        commentCount: 18,
        itemUrl: 'https://news.ycombinator.com/item?id=123',
      },
    ])
    render(
      <HnDiscussionsAside
        enabled
        urls={['https://example.com/a']}
      />,
    )
    await waitFor(() => {
      expect(screen.getByTestId('hn-discussions-aside')).toBeInTheDocument()
    })
    expect(screen.getByTestId('hn-discussions-title')).toHaveTextContent('Example thread')
    expect(screen.getByTestId('hn-discussions-score')).toHaveTextContent('42 points')
    expect(screen.getByTestId('hn-discussions-comments')).toHaveTextContent('18 comments')
    expect(screen.getByTestId('hn-discussions-title')).toHaveAttribute(
      'href',
      'https://news.ycombinator.com/item?id=123',
    )
  })

  it('renders nothing when Algolia returns no threads', async () => {
    searchMock.mockResolvedValue([])
    render(
      <HnDiscussionsAside
        enabled
        urls={['https://example.com/a']}
      />,
    )
    await waitFor(() => {
      expect(searchMock).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('hn-discussions-aside')).not.toBeInTheDocument()
  })
})
