import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'

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

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: vi.fn<VitestLooseMock>(), success: vi.fn<VitestLooseMock>() },
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/api/client/bookmarks'), () => ({
  bookmarkEntity: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/links/entity-href'),
  () =>
    ({
      topicHref: (topic: { slug: string }) => `/topics/${topic.slug}`,
    }) as unknown as typeof import('@/lib/links/entity-href'),
)

import { bookmarkEntity } from '@/lib/api/client/bookmarks'
import { RecommendedTopicsAsideContent } from './recommended-topics-aside-content'

const mockBookmarkEntity = vi.mocked(bookmarkEntity)

const topics = [
  { id: 'topic-1', name: 'Visa Platinum', slug: 'visa-platinum' },
  { id: 'topic-2', name: 'Chase Sapphire', slug: 'chase-sapphire' },
]

describe('RecommendedTopicsAsideContent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockBookmarkEntity.mockResolvedValue({} as never)
  })

  it('renders topic names as links', () => {
    render(
      <RecommendedTopicsAsideContent
        topics={topics as never}
        initialBookmarks={{}}
      />,
    )
    expect(screen.getByRole('link', { name: 'Visa Platinum' })).toBeDefined()
    expect(screen.getByRole('link', { name: 'Chase Sapphire' })).toBeDefined()
  })

  it('links to the topic page', () => {
    render(
      <RecommendedTopicsAsideContent
        topics={topics as never}
        initialBookmarks={{}}
      />,
    )
    expect(screen.getByRole('link', { name: 'Visa Platinum' }).getAttribute('href')).toBe(
      '/topics/visa-platinum',
    )
  })

  it('renders a link to /my/topics/dismissed-recommendations', () => {
    render(
      <RecommendedTopicsAsideContent
        topics={topics as never}
        initialBookmarks={{}}
      />,
    )
    const dismissedLink = document.querySelector(
      '[data-pw="recommended-topics-aside-dismissed-link"]',
    )
    expect(dismissedLink).not.toBeNull()
    expect(dismissedLink!.getAttribute('href')).toBe('/my/topics/dismissed-recommendations')
  })

  it('removes a topic from the list after follow', async () => {
    render(
      <RecommendedTopicsAsideContent
        topics={topics as never}
        initialBookmarks={{}}
      />,
    )
    const followButtons = screen.getAllByRole('button', { name: 'Follow' })
    fireEvent.click(followButtons[0]!)
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Visa Platinum' })).toBeNull()
    })
    expect(mockBookmarkEntity).toHaveBeenCalledWith('topic', 'topic-1', 'follow')
  })

  it('removes a topic from the list after dismiss', async () => {
    render(
      <RecommendedTopicsAsideContent
        topics={topics as never}
        initialBookmarks={{}}
      />,
    )
    const dismissButtons = screen.getAllByRole('button', { name: /^Dismiss / })
    fireEvent.click(dismissButtons[0]!)
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Visa Platinum' })).toBeNull()
    })
    expect(mockBookmarkEntity).toHaveBeenCalledWith('topic', 'topic-1', 'dismiss_recommendation')
  })

  it('hides already-followed topics from initialBookmarks', () => {
    const bookmarks = { 'topic-1': { follow: true } }
    render(
      <RecommendedTopicsAsideContent
        topics={topics as never}
        initialBookmarks={bookmarks}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Visa Platinum' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Chase Sapphire' })).toBeDefined()
  })

  it('hides blocked topics from initialBookmarks', () => {
    const bookmarks = { 'topic-1': { block: true } }
    render(
      <RecommendedTopicsAsideContent
        topics={topics as never}
        initialBookmarks={bookmarks}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Visa Platinum' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Chase Sapphire' })).toBeDefined()
  })
})
