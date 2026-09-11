import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { CommentPermalink } from '../comment-permalink'
import type { PostsResponseBody } from '@/types/api-responses'
import type { Post } from '@/types/posts'
import type { getTranslations } from '@/lib/i18n/get-translations'

const { mockFetchPostDescendants } = vi.hoisted(() => ({
  mockFetchPostDescendants: vi.fn<VitestLooseMock>(),
}))

// Stub translator returning the English source text for the keys this component uses,
// so this test doesn't depend on the not-yet-merged catalog entries for the new keys.
const stubT = ((key: string, params?: Record<string, string>) => {
  if (key === 'extracted.comments.commentPermalink.commentOnTitle_02b6af38') {
    return `Comment on ${params?.title ?? ''}`
  }
  if (key === 'extracted.comments.commentPermalink.untitledPost_2e2fc1fc') return 'Untitled Post'
  if (key === 'extracted.comments.commentPermalink.deleted_dd5f43ed') return '[deleted]'
  if (key === 'extracted.comments.commentPermalink.anonymous_e7a8aa2d') return 'Anonymous'
  return key
}) as Awaited<ReturnType<typeof getTranslations>>

vi.mock(
  import('next/link'),
  () =>
    ({
      default: ({
        children,
        href,
        className,
        ...props
      }: {
        children: ReactNode
        href: string
        className?: string
      } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
        <a
          href={href}
          className={className}
          {...props}
        >
          {children}
        </a>
      ),
    }) as unknown as typeof import('next/link'),
)

vi.mock(import('../comment-tree'), () => ({
  CommentTree: () => <div>Comment Tree</div>,
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  fetchPostDescendants: mockFetchPostDescendants,
}))

vi.mock(import('@/components/shared/infinite-scroll'), () => ({
  InfiniteScroll: ({
    children,
    hasNextPage,
    onLoadMore,
  }: {
    children: ReactNode
    hasNextPage: boolean
    onLoadMore: () => void
  }) => (
    <div>
      {children}
      {hasNextPage && (
        <button
          type='button'
          onClick={onLoadMore}
        >
          Load more
        </button>
      )}
    </div>
  ),
}))

vi.mock(import('@/components/admin/admin-moderation-button'), () => ({
  default: () => <div data-testid='admin-moderation-button' />,
}))

vi.mock(import('@/components/shared/report-menu-item'), () => ({
  ReportMenuKebab: () => <div data-pw='report-menu-kebab' />,
}))

function makeRootPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'root-1',
    post_type: 'discussion',
    title: 'Root Post',
    slug: 'root-post',
    markdown: 'Root content',
    root_id: null,
    created_by_id: 'user-1',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    deleted_at: null,
    deleted_by_id: null,
    archived_at: null,
    archived_by_id: null,
    broadcast: 'everyone',
    privacy: 'public',
    is_anonymous: false,
    community_id: null,
    clearance_status: 'approved',
    ...overrides,
  }
}

function makeTargetComment(rootPost: Post, overrides: Partial<Post> = {}): Post {
  return {
    ...rootPost,
    id: 'comment-1',
    post_type: 'comment',
    title: '',
    root_id: 'root-1',
    markdown: 'Comment body',
    created_by: {
      __entity_type: 'user',
      id: 'user-1',
      username: 'author',
      profile_image_id: null,
    },
    ...overrides,
  }
}

function makeCommentsData(targetComment: Post): PostsResponseBody {
  return {
    results: [{ __entity_type: 'post', id: 'comment-1', ranking: 0, search_vector_ts: null }],
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    posts: { 'comment-1': targetComment },
    posts_metrics: {},
    markdown_to_html: { 'comment-1': '<p>Comment body</p>' },
  }
}

describe('CommentPermalink', () => {
  it('renders a page heading and continues descendants from the target comment', async () => {
    const rootPost = makeRootPost()
    const targetComment = makeTargetComment(rootPost)
    const commentsData = makeCommentsData(targetComment)

    mockFetchPostDescendants.mockResolvedValueOnce({
      ...commentsData,
      results: [],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(
      <CommentPermalink
        targetCommentId='comment-1'
        rootPostId='root-1'
        rootPostType='discussion'
        rootPost={rootPost}
        ancestors={commentsData}
        descendants={{
          ...commentsData,
          results: [],
          page_info: { has_next_page: true, end_cursor: 'descendants-cursor', start_cursor: null },
        }}
        isAdmin={false}
        hideDownCount={false}
        t={stubT}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Comment on Root Post' })).toBeDefined()
    expect(screen.getByRole('link', { name: /root post/i })).toHaveAttribute(
      'href',
      '/discussion/root-post',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() =>
      expect(mockFetchPostDescendants).toHaveBeenCalledWith('comment-1', {
        after: 'descendants-cursor',
      }),
    )
  })

  it('marks the root post link with the original content language and direction', () => {
    const rootPost = makeRootPost({
      title: 'عنوان الجذر',
      declared_language: 'ar',
      lingua_rs_detected_language: 'en',
    })
    const targetComment = makeTargetComment(rootPost, {
      declared_language: null,
      lingua_rs_detected_language: null,
    })
    const commentsData = makeCommentsData(targetComment)

    render(
      <CommentPermalink
        targetCommentId='comment-1'
        rootPostId='root-1'
        rootPostType='discussion'
        rootPost={rootPost}
        ancestors={commentsData}
        descendants={{ ...commentsData, results: [] }}
        isAdmin={false}
        hideDownCount={false}
        t={stubT}
      />,
    )

    const rootTitle = screen.getByText('عنوان الجذر')
    expect(rootTitle).toHaveAttribute('lang', 'ar')
    expect(rootTitle).toHaveAttribute('dir', 'rtl')
  })

  it('renders the localized fallback title on the root post link when untitled', () => {
    const rootPost = makeRootPost({
      title: '',
      markdown: '',
      declared_language: 'ar',
      lingua_rs_detected_language: 'en',
    })
    const targetComment = makeTargetComment(rootPost, {
      declared_language: null,
      lingua_rs_detected_language: null,
    })
    const commentsData = makeCommentsData(targetComment)

    render(
      <CommentPermalink
        targetCommentId='comment-1'
        rootPostId='root-1'
        rootPostType='discussion'
        rootPost={rootPost}
        ancestors={commentsData}
        descendants={{ ...commentsData, results: [] }}
        isAdmin={false}
        hideDownCount={false}
        t={stubT}
      />,
    )

    const rootTitle = screen.getByText('Untitled Post')
    expect(rootTitle.closest('a')).not.toBeNull()
    expect(rootTitle).not.toHaveAttribute('lang')
    expect(rootTitle).not.toHaveAttribute('dir')
  })
})
