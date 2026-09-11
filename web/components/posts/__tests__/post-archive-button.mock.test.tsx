import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostArchiveButton } from '../post-form/post-archive-button'
import type { Post } from '@/types/posts'

const mockRouterRefresh = vi.fn<VitestLooseMock>()
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRouterRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

vi.mock(import('@/lib/api/client/posts'), () => ({
  archivePost: vi.fn<VitestLooseMock>(),
  unarchivePost: vi.fn<VitestLooseMock>(),
}))

const { mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockToastError: vi.fn<VitestLooseMock>(),
  mockToastSuccess: vi.fn<VitestLooseMock>(),
}))
vi.mock(
  import('sonner'),
  () =>
    ({
      toast: { error: mockToastError, success: mockToastSuccess },
    }) as unknown as typeof import('sonner'),
)

import { archivePost, unarchivePost } from '@/lib/api/client/posts'

const mockArchivePost = vi.mocked(archivePost)
const mockUnarchivePost = vi.mocked(unarchivePost)

const basePost: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Test Post',
  markdown: 'Content',
  root_id: null,
  created_by_id: 'user-1',
  created_at: '2026-05-17T20:00:00Z',
  updated_at: '2026-05-17T20:00:00Z',
  deleted_at: null,
  deleted_by_id: null,
  archived_at: null,
  archived_by_id: null,
  broadcast: 'everyone',
  privacy: 'public',
  is_anonymous: false,
  community_id: null,
  clearance_status: 'approved',
}

describe('PostArchiveButton', () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear()
    mockArchivePost.mockReset()
    mockUnarchivePost.mockReset()
    mockToastError.mockReset()
  })

  it('renders Archive for unarchived posts and refreshes after archivePost succeeds', async () => {
    mockArchivePost.mockResolvedValue({
      post: { ...basePost, archived_at: '2026-05-17T20:00:00Z' },
    })

    render(
      <PostArchiveButton
        archivedAt={null}
        postIdOrSlug='post-1'
      />,
    )

    const button = screen.getByRole('button', { name: 'Archive' })
    expect(button).toHaveClass('h-11')
    fireEvent.click(button)

    expect(mockArchivePost).toHaveBeenCalledWith('post-1')
    expect(button).toHaveTextContent('Unarchive')
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it('renders Unarchive for archived posts and refreshes after unarchivePost succeeds', async () => {
    mockUnarchivePost.mockResolvedValue({ post: basePost })

    render(
      <PostArchiveButton
        archivedAt='2026-05-17T20:00:00Z'
        postIdOrSlug='post-1'
      />,
    )

    const button = screen.getByRole('button', { name: 'Unarchive' })
    fireEvent.click(button)

    expect(mockUnarchivePost).toHaveBeenCalledWith('post-1')
    expect(button).toHaveTextContent('Archive')
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it('rolls back optimistic archive state on failure', async () => {
    mockArchivePost.mockRejectedValue(new Error('nope'))

    render(
      <PostArchiveButton
        archivedAt={null}
        postIdOrSlug='post-1'
      />,
    )

    const button = screen.getByRole('button', { name: 'Archive' })
    fireEvent.click(button)

    expect(button).toHaveTextContent('Unarchive')
    await waitFor(() => expect(button).toHaveTextContent('Archive'))
    expect(mockRouterRefresh).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('Failed to archive post. Please try again.')
  })
})
