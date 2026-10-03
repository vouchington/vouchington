import {
  mockAuth,
  toast,
} from '@/test-helpers/components/shared/follower-share-actions.mock-support'

import { FollowerShareActions } from '../follower-share-actions'

import { sendPostToFollowers, sharePostWithFollowers } from '@/lib/api/client/posts'

import { sendRssFeedItemToFollowers } from '@/lib/api/client/rss-feeds'

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
        { account_type: null, id: 'user-2', username: 'alpha' },
        { account_type: null, id: 'user-3', username: 'beta' },
      ],
      page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
    })
  })

  it('sends RSS feed items to all followers', async () => {
    vi.mocked(sendRssFeedItemToFollowers).mockResolvedValue({
      status: 'accepted',
      distribution_id: 'distribution-1',
    })

    render(
      <FollowerShareActions
        entityType='rss_feed_item'
        entityId='item-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))

    await waitFor(() => {
      expect(sendRssFeedItemToFollowers).toHaveBeenCalledWith('item-1', {
        audience: 'all_followers',
      })
      expect(toast.success).toHaveBeenCalledWith('Send queued')
    })
    expect(fetchFollowerUsers).not.toHaveBeenCalled()
  })

  it('requires at least one selected follower before sending', async () => {
    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Selected followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
      expect(sendPostToFollowers).not.toHaveBeenCalled()
    })
  })

  it('surfaces send failures', async () => {
    vi.mocked(sendPostToFollowers).mockRejectedValue(new Error('API unavailable'))

    render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Send to followers' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send now' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
  })

  it('allows sharing a new entity while an earlier share is pending', async () => {
    let resolveFirstShare!: (response: FollowerDistributionAcceptedResponseBody) => void
    vi.mocked(sharePostWithFollowers)
      .mockImplementationOnce(
        () =>
          new Promise<FollowerDistributionAcceptedResponseBody>(resolve => {
            resolveFirstShare = resolve
          }),
      )
      .mockResolvedValueOnce({
        status: 'accepted',
        distribution_id: 'distribution-2',
      })

    const { rerender } = render(
      <FollowerShareActions
        entityType='post'
        entityId='post-1'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Share with followers' }))
    await waitFor(() => expect(sharePostWithFollowers).toHaveBeenCalledTimes(1))

    rerender(
      <FollowerShareActions
        entityType='post'
        entityId='post-2'
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Share with followers' }))
    await waitFor(() => expect(sharePostWithFollowers).toHaveBeenCalledWith('post-2'))

    await act(async () =>
      resolveFirstShare({ status: 'accepted', distribution_id: 'distribution-1' }),
    )

    expect(toast.success).toHaveBeenCalledTimes(1)
  })
})
