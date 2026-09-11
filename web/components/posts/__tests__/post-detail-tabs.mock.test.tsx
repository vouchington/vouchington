import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { PostDetailTabs } from '../post-detail-tabs'
import { consumePreservedScrollPathname } from '@/lib/navigation/scroll-preservation'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        prefetch: _prefetch,
        scroll: _scroll,
        ...props
      }: {
        children: React.ReactNode
        href: string
        prefetch?: boolean
        scroll?: boolean
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
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({
        push: vi.fn<VitestLooseMock>(),
      }),
    }) as unknown as typeof import('next/navigation'),
)

describe('PostDetailTabs', () => {
  beforeEach(() => {
    consumePreservedScrollPathname('/__test_reset__')
  })

  it('renders both Comments and Manage Tags tabs when authenticated', () => {
    const { container } = render(
      <PostDetailTabs
        activeTab='comments'
        commentCount={0}
        postType='review'
        postId='post-1'
        isAuthenticated
      />,
    )

    expect(container.querySelector('[data-pw="post-detail-tab-comments"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="post-detail-tab-manage-tags"]')).not.toBeNull()
  })

  it('renders only Comments tab when not authenticated', () => {
    const { container } = render(
      <PostDetailTabs
        activeTab='comments'
        commentCount={0}
        postType='review'
        postId='post-1'
        isAuthenticated={false}
      />,
    )

    expect(container.querySelector('[data-pw="post-detail-tab-comments"]')).not.toBeNull()
    expect(container.querySelector('[data-pw="post-detail-tab-manage-tags"]')).toBeNull()
  })

  it('highlights Manage Tags when active', () => {
    const { container } = render(
      <PostDetailTabs
        activeTab='manage-tags'
        commentCount={0}
        postType='discussion'
        postId='abc-123'
        isAuthenticated
        activeTag='post'
      />,
    )

    const manageTagsTab = container.querySelector('[data-pw="post-detail-tab-manage-tags"]')
    expect(manageTagsTab).toHaveAttribute('data-active', 'true')
    expect(manageTagsTab).toHaveAttribute('aria-current', 'page')
  })

  it('Comments tab links to the post detail route', () => {
    const { container } = render(
      <PostDetailTabs
        activeTab='manage-tags'
        commentCount={0}
        postType='review'
        postId='xyz-456'
        isAuthenticated
      />,
    )

    const commentsTab = container.querySelector('[data-pw="post-detail-tab-comments"]')
    expect(commentsTab).toHaveAttribute('href', '/review/xyz-456')
  })

  it('preserves scroll when navigating through post detail tabs', () => {
    const { container } = render(
      <PostDetailTabs
        activeTab='manage-tags'
        commentCount={0}
        postType='review'
        postId='xyz-456'
        isAuthenticated
      />,
    )

    const commentsTab = container.querySelector('[data-pw="post-detail-tab-comments"]')
    expect(commentsTab).not.toBeNull()
    fireEvent.click(commentsTab!)

    expect(consumePreservedScrollPathname('/review/xyz-456')).toBe(true)
  })

  it('renders locale-formatted comment count in the Comments tab', () => {
    const { container } = render(
      <PostDetailTabs
        activeTab='comments'
        commentCount={1000}
        postType='review'
        postId='post-1'
        isAuthenticated={false}
      />,
    )

    expect(container.querySelector('[data-pw="post-detail-tab-comments"]')?.textContent).toBe(
      'Comments (1,000)',
    )
  })

  it('formats the Comments tab count with the resolved UI locale', () => {
    const { container } = render(
      <UiLocaleProvider uiLocale='de-DE'>
        <PostDetailTabs
          activeTab='comments'
          commentCount={1000}
          postType='review'
          postId='post-1'
          isAuthenticated={false}
        />
      </UiLocaleProvider>,
    )

    expect(container.querySelector('[data-pw="post-detail-tab-comments"]')?.textContent).toBe(
      'Comments (1.000)',
    )
  })
})
