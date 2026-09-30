import { render } from '@testing-library/react'
import { describe, vi } from 'vitest'
import { navMockModule } from '@/test-helpers/next-navigation-mock'
import { registerPostActionButtonTests } from '@/test-helpers/components/posts/post-action-button-tests'
import { PostLockButton } from '../post-lock-button'

vi.mock(import('next/navigation'), () => navMockModule)

vi.mock(import('@/lib/api/client/posts-lock'), () => ({
  lockPost: vi.fn<VitestLooseMock>(),
  unlockPost: vi.fn<VitestLooseMock>(),
}))

const { mockOnError } = vi.hoisted(() => ({
  mockOnError: vi.fn<VitestLooseMock>(),
}))
vi.mock(import('@/lib/on-error'), () => ({
  default: mockOnError,
}))

import { lockPost, unlockPost } from '@/lib/api/client/posts-lock'

const mockLockPost = vi.mocked(lockPost)
const mockUnlockPost = vi.mocked(unlockPost)
const lockedAt = '2026-06-01T00:00:00Z'

describe('PostLockButton', () => {
  registerPostActionButtonTests({
    postId: 'post-1',
    inactiveLabel: 'Lock',
    activeLabel: 'Unlock',
    activeAt: lockedAt,
    renderAt: timestamp => {
      render(
        <PostLockButton
          lockedAt={timestamp}
          postIdOrSlug='post-1'
        />,
      )
    },
    activate: mockLockPost,
    deactivate: mockUnlockPost,
    prepareActivate: () => {
      mockLockPost.mockResolvedValue(undefined)
    },
    prepareDeactivate: () => {
      mockUnlockPost.mockResolvedValue(undefined)
    },
    prepareActivateFailure: () => {
      mockLockPost.mockRejectedValue(new Error('nope'))
    },
    reset: () => {
      mockLockPost.mockReset()
      mockUnlockPost.mockReset()
      mockOnError.mockReset()
    },
    activateFailure: {
      kind: 'fallback',
      mock: mockOnError,
      fallback: 'Failed to lock thread. Please try again.',
    },
  })
})
