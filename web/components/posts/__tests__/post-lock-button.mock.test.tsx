import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PostLockButton } from '../post-lock-button'

const mockRouterRefresh = vi.fn<VitestLooseMock>()
vi.mock(
  import('next/navigation'),
  () =>
    ({
      useRouter: () => ({ refresh: mockRouterRefresh }),
    }) as unknown as typeof import('next/navigation'),
)

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

describe('PostLockButton', () => {
  beforeEach(() => {
    mockRouterRefresh.mockClear()
    mockLockPost.mockReset()
    mockUnlockPost.mockReset()
    mockOnError.mockReset()
  })

  it('renders Lock for unlocked posts; calls lockPost and router.refresh on success', async () => {
    mockLockPost.mockResolvedValue(undefined)

    render(
      <PostLockButton
        lockedAt={null}
        postIdOrSlug='post-1'
      />,
    )

    const button = screen.getByRole('button', { name: 'Lock' })
    fireEvent.click(button)

    expect(mockLockPost).toHaveBeenCalledWith('post-1')
    expect(button).toHaveTextContent('Unlock')
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it('renders Unlock for locked posts; calls unlockPost and router.refresh on success', async () => {
    mockUnlockPost.mockResolvedValue(undefined)

    render(
      <PostLockButton
        lockedAt='2026-06-01T00:00:00Z'
        postIdOrSlug='post-1'
      />,
    )

    const button = screen.getByRole('button', { name: 'Unlock' })
    fireEvent.click(button)

    expect(mockUnlockPost).toHaveBeenCalledWith('post-1')
    expect(button).toHaveTextContent('Lock')
    await waitFor(() => {
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(mockRouterRefresh).toHaveBeenCalled()
    })
  })

  it('rolls back optimistic lock state on failure and does not refresh', async () => {
    mockLockPost.mockRejectedValue(new Error('nope'))

    render(
      <PostLockButton
        lockedAt={null}
        postIdOrSlug='post-1'
      />,
    )

    const button = screen.getByRole('button', { name: 'Lock' })
    fireEvent.click(button)

    expect(button).toHaveTextContent('Unlock')
    await waitFor(() => expect(button).toHaveTextContent('Lock'))
    expect(mockOnError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ fallback: 'Failed to lock thread. Please try again.' }),
    )
    expect(mockRouterRefresh).not.toHaveBeenCalled()
  })
})
