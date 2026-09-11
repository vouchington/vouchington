import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TestMarkdownHtmlPage from './page'
import { getPosts } from '@/lib/api/server'

vi.mock(import('@/lib/api/server'), () => ({
  getPosts: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/components/page-with-aside'), () => ({
  PageWithAside: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}))

vi.mock(
  import('@/components/ui/card'),
  () =>
    ({
      Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
    }) as unknown as typeof import('@/components/ui/card'),
)

vi.mock(
  import('@/components/posts/post-detail'),
  () =>
    ({
      PostDetail: ({ post }: { post: { id: string } }) => <article>{post.id}</article>,
    }) as unknown as typeof import('@/components/posts/post-detail'),
)

describe('TestMarkdownHtmlPage', () => {
  it('fetches posts without requiring the current user', async () => {
    vi.mocked(getPosts).mockResolvedValueOnce({
      results: [{ __entity_type: 'post', id: 'post-1', ranking: 1, search_vector_ts: null }],
      posts: {
        'post-1': {
          id: 'post-1',
          post_type: 'discussion',
          title: 'Post',
          markdown: 'Hello',
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
        },
      },
      markdown_to_html: { 'post-1': '<p>Hello</p>' },
      posts_metrics: {},
      post_elections: {},
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })

    render(await TestMarkdownHtmlPage())

    expect(getPosts).toHaveBeenCalledWith({ limit: 5 })
    expect(screen.getByText('post-1')).toBeInTheDocument()
  })
})
