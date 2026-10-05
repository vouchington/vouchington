import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { registerPostActionButtonTests } from '@/test-helpers/components/posts/post-action-button-tests'
import { PostArchiveButton } from '../post-form/post-archive-button'
import type { Post } from '@/types/posts'

vi.mock(import('next/navigation'), () => navMockModule)

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
const archivedAt = '2026-05-17T20:00:00Z'

const basePost: Post = {
  id: 'post-1',
  post_type: 'discussion',
  title: 'Test Post',
  markdown: 'Content',
  root_post_id: null,
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
  registerPostActionButtonTests({
    postId: 'post-1',
    inactiveLabel: 'Archive',
    activeLabel: 'Unarchive',
    activeAt: archivedAt,
    renderAt: timestamp => {
      render(
        <PostArchiveButton
          archivedAt={timestamp}
          postIdOrSlug='post-1'
        />,
      )
    },
    activate: mockArchivePost,
    deactivate: mockUnarchivePost,
    prepareActivate: () => {
      mockArchivePost.mockResolvedValue({
        post: { ...basePost, archived_at: archivedAt },
      })
    },
    prepareDeactivate: () => {
      mockUnarchivePost.mockResolvedValue({ post: basePost })
    },
    prepareActivateFailure: () => {
      mockArchivePost.mockRejectedValue(new Error('nope'))
    },
    reset: () => {
      mockArchivePost.mockReset()
      mockUnarchivePost.mockReset()
      mockToastError.mockReset()
    },
    activateFailure: {
      kind: 'message',
      mock: mockToastError,
      message: 'Failed to archive post. Please try again.',
    },
  })

  it('renders the archive button at the touch target size', () => {
    render(
      <PostArchiveButton
        archivedAt={null}
        postIdOrSlug='post-1'
      />,
    )
    expect(screen.getByRole('button', { name: 'Archive' })).toHaveClass('h-11')
  })
})
