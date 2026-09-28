import {
  makeItem,
  makePost,
  makeStory,
  mockAuthState,
} from '@/test-helpers/components/news/news-item-cluster.mock-support'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewsItemCluster } from '../news-item-cluster'

vi.mock(import('@/components/news/use-viewer-has-community'), () => ({
  useViewerHasCommunity: vi.fn<() => boolean>().mockReturnValue(false),
}))

vi.mock(
  import('@/components/ui/dropdown-menu'),
  () =>
    ({
      DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
      DropdownMenuSeparator: () => <hr />,
      DropdownMenuItem: ({
        children,
        asChild,
        ...props
      }: {
        children: React.ReactNode
        asChild?: boolean
        [k: string]: unknown
      }) =>
        asChild ? (
          <div {...props}>{children}</div>
        ) : (
          <button
            type='button'
            {...props}
          >
            {children}
          </button>
        ),
    }) as unknown as typeof import('@/components/ui/dropdown-menu'),
)

const primary = makeItem('item-1', 'Primary Article')
const storyItem1 = makeItem('item-2', 'Related Article 1')

describe('NewsItemCluster rendering', () => {
  it('renders discussion links when relatedPosts are provided', () => {
    const relatedPosts: Post[] = [
      makePost({
        id: 'post-1',
        post_type: 'discussion',
        title: 'Discussion about article',
        slug: 'discussion-about-article',
      }),
    ]
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        view='summary'
        relatedPosts={relatedPosts}
      />,
    )
    expect(screen.getByText('Discussion about article')).toBeDefined()
  })

  it('renders "Discuss" button when logged in with no related posts', () => {
    render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        view='summary'
        relatedPosts={[]}
      />,
    )
    expect(screen.getByText('Discuss')).toBeDefined()
  })

  it('renders neither discussions nor button when logged out with no related posts', () => {
    mockAuthState.isAuthenticated = false
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        view='summary'
        relatedPosts={[]}
      />,
    )
    expect(container.querySelector('[data-pw="news-discuss-button"]')).toBeNull()
    mockAuthState.isAuthenticated = true
  })

  it('member NewsItemCards inside story cluster render bare (no nested Card)', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[storyItem1]}
        story={makeStory()}
        view='summary'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /1 related article/i }))

    const clusterCard = container.querySelector('[data-pw="news-item-cluster"]')
    expect(clusterCard).not.toBeNull()
    const bareCards = clusterCard?.querySelectorAll('article[data-pw="news-item-card"]')
    expect(bareCards?.length).toBeGreaterThan(0)
    const cardWrapped = clusterCard?.querySelectorAll('div[data-pw="news-item-card"]')
    expect(cardWrapped?.length).toBe(0)
  })

  it('action row uses horizontal scroll instead of wrapping on narrow viewports', () => {
    const { container } = render(
      <NewsItemCluster
        primary={primary}
        storyItems={[]}
        view='summary'
        relatedPosts={[]}
      />,
    )
    const actionRow = container.querySelector('.scrollbar-hide')
    expect(actionRow).not.toBeNull()
    expect(actionRow?.className).toContain('overflow-x-auto')
    expect(actionRow?.className).not.toContain('flex-wrap')
    expect(actionRow?.className).toContain('scrollbar-hide')
  })
})
