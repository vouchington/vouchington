/* oxlint-disable jest/no-untyped-mock-factory, vitest/prefer-import-in-mock -- web tests may use partial internal-module mocks */
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentAncestorTrail } from '../comment-ancestor-trail'
import type { PostsResponseBody } from '@/types/api-responses'

const { mockFetchPostAncestors } = vi.hoisted(() => ({
  mockFetchPostAncestors: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client/posts'), () => ({
  fetchPostAncestors: mockFetchPostAncestors,
}))

vi.mock(import('@/lib/i18n/use-translations'), () => ({
  useTranslations: () => (key: string) => {
    if (key.includes('showEarlierReplies')) return 'Show earlier replies'
    if (key.includes('loading')) return 'Loading…'
    if (key.includes('retry')) return 'Retry'
    if (key.includes('failedToLoad')) return 'Failed to load earlier replies.'
    if (key.includes('anonymous')) return 'Anonymous'
    return '[deleted]'
  },
}))

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

vi.mock('@/components/shared/markdown-content', () => ({
  MarkdownContent: ({ html }: { html?: string | null }) => <div>{html}</div>,
}))

function page(ids: string[], cursor: string | null): PostsResponseBody {
  return {
    results: ids.map(id => ({ __entity_type: 'post', id })),
    page_info: {
      has_next_page: cursor !== null,
      start_cursor: null,
      end_cursor: cursor,
    },
    posts: Object.fromEntries(
      ids.map(id => [
        id,
        {
          id,
          post_type: id === 'root' ? 'discussion' : 'comment',
          root_id: id === 'root' ? null : 'root',
          markdown: id,
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          created_by: { id: `user-${id}`, username: id },
        },
      ]),
    ),
    markdown_to_html: Object.fromEntries(ids.map(id => [id, `<p>${id}</p>`])),
  } as unknown as PostsResponseBody
}

describe('CommentAncestorTrail', () => {
  beforeEach(() => mockFetchPostAncestors.mockReset())

  it('loads omitted ancestors rootward and preserves root-to-target order', async () => {
    mockFetchPostAncestors.mockResolvedValueOnce(page(['root', 'parent-1'], null))

    render(
      <CommentAncestorTrail
        targetCommentId='target'
        rootPostId='root'
        rootPostPath='/discussion/root'
        initialAncestors={page(['root', 'parent-2', 'target'], 'cursor-1')}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show earlier replies' }))

    await waitFor(() =>
      expect(mockFetchPostAncestors).toHaveBeenCalledWith('target', {
        after: 'cursor-1',
        limit: 5,
      }),
    )
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'parent-1',
      'parent-2',
    ])
    expect(screen.queryByRole('button', { name: 'Show earlier replies' })).not.toBeInTheDocument()
  })

  it('keeps visible ancestors and retries the same cursor after failure', async () => {
    mockFetchPostAncestors
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(page(['root', 'parent-1'], null))

    render(
      <CommentAncestorTrail
        targetCommentId='target'
        rootPostId='root'
        rootPostPath='/discussion/root'
        initialAncestors={page(['root', 'parent-2', 'target'], 'cursor-1')}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Show earlier replies' }))
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'parent-2' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(mockFetchPostAncestors).toHaveBeenCalledTimes(2))
    expect(screen.getAllByRole('link').map(link => link.textContent)).toEqual([
      'parent-1',
      'parent-2',
    ])
  })
})
