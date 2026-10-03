import { mockAuth } from '@/test-helpers/components/shared/follower-share-actions.mock-support'

import { FollowerShareActions } from '../follower-share-actions'

import { sendPostToFollowers } from '@/lib/api/client/posts'

import { fetchFollowerUsers } from '@/lib/api/client/users'

import type { FollowerDistributionAcceptedResponseBody } from '@/types/api-responses'
import type { User } from '@/types/user'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'

import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('FollowerShareActions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAuth.currentUser = { id: 'user-1' } as User
    vi.mocked(fetchFollowerUsers).mockResolvedValue({
      results: [
        { account_type: null, id: '01900000-0000-7000-8000-000000000002', username: 'alpha' },
        { account_type: null, id: 'user-3', username: 'beta' },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  it('sends to all followers by default', async () => {
    vi.mocked(sendPostToFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })

    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))

    await waitFor(() => {
      expect(sendPostToFollowers).toHaveBeenCalledWith('post-1', { audience: 'all_followers' })
    })
    expect(fetchFollowerUsers).not.toHaveBeenCalled()
  })

  it('sends to selected followers', async () => {
    vi.mocked(sendPostToFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })

    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Selected followers' }))

    await waitFor(() => {
      expect(fetchFollowerUsers).toHaveBeenCalledWith('user-1', {
        after: undefined,
        q: undefined,
        limit: 5,
        signal: expect.any(AbortSignal),
      })
    })

    fireEvent.click(await screen.findByRole('button', { name: /alpha/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))

    await waitFor(() => {
      expect(sendPostToFollowers).toHaveBeenCalledWith('post-1', {
        audience: 'selected_followers',
        recipient_user_ids: ['01900000-0000-7000-8000-000000000002'],
      })
    })
  })

  it('clears recipient state when the target entity changes', async () => {
    vi.mocked(sendPostToFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })
    const { rerender } = render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Selected followers' }))
    fireEvent.click(await screen.findByRole('button', { name: /alpha/i }))

    rerender(
      <FollowerShareActions
        entityType='post'
        entityId='post-2'
      />,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    await waitFor(() => {
      expect(sendPostToFollowers).toHaveBeenCalledWith('post-2', { audience: 'all_followers' })
    })
  })

  it('keeps a new entity dialog open when an earlier send completes', async () => {
    let resolveFirstSend!: (response: FollowerDistributionAcceptedResponseBody) => void
    let resolveSecondSend!: (response: FollowerDistributionAcceptedResponseBody) => void
    vi.mocked(sendPostToFollowers)
      .mockImplementationOnce(
        () =>
          new Promise<FollowerDistributionAcceptedResponseBody>(resolve => {
            resolveFirstSend = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<FollowerDistributionAcceptedResponseBody>(resolve => {
            resolveSecondSend = resolve
          }),
      )

    const { rerender } = render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    await waitFor(() => expect(sendPostToFollowers).toHaveBeenCalledTimes(1))

    rerender(
      <FollowerShareActions
        entityType='post'
        entityId='post-2'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))
    await waitFor(() => expect(sendPostToFollowers).toHaveBeenCalledTimes(2))

    await act(async () => resolveFirstSend(acceptedResponse('distribution-1')))

    expect(screen.getByRole('heading', { name: 'Send to followers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sending...' })).toBeDisabled()

    await act(async () => resolveSecondSend(acceptedResponse('distribution-2')))
  })
})

function acceptedResponse(distributionId: string): FollowerDistributionAcceptedResponseBody {
  return { status: 'accepted', distribution_id: distributionId }
}
