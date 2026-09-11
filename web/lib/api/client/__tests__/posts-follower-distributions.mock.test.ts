import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('../instance'),
)

import { sendPostToFollowers, sharePostWithFollowers } from '../posts'
import { clientApi } from '../instance'

const mockPost = vi.mocked(clientApi.post)

describe('posts follower distribution client', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs to the post follower share endpoint', async () => {
    const response = { status: 'accepted', distribution_id: 'distribution-1' }
    mockPost.mockResolvedValueOnce(response)

    const result = await sharePostWithFollowers('post slug')

    expect(mockPost).toHaveBeenCalledWith('/api/v1/posts/post%20slug/shares')
    expect(result).toBe(response)
  })

  it('POSTs to the post follower send endpoint', async () => {
    const response = { status: 'accepted', distribution_id: 'distribution-1' }
    mockPost.mockResolvedValueOnce(response)
    const body = { audience: 'all_followers' } as const

    const result = await sendPostToFollowers('post slug', body)

    expect(mockPost).toHaveBeenCalledWith('/api/v1/posts/post%20slug/sends', body)
    expect(result).toBe(response)
  })

  it('rejects invalid selected follower bodies before the request', async () => {
    await expect(
      sendPostToFollowers('post-1', {
        audience: 'selected_followers',
        recipient_user_ids: [],
      }),
    ).rejects.toThrow('Choose at least one follower')

    const duplicateId = 'user-1'
    await expect(
      sendPostToFollowers('post-1', {
        audience: 'selected_followers',
        recipient_user_ids: [duplicateId, duplicateId],
      }),
    ).rejects.toThrow('Choose each follower only once')

    await expect(
      sendPostToFollowers('post-1', {
        audience: 'selected_followers',
        recipient_user_ids: Array.from({ length: 101 }, (_, index) => `user-${index}`),
      }),
    ).rejects.toThrow('Choose at most 100 followers')

    await expect(
      sendPostToFollowers('post-1', {
        audience: 'selected_followers',
        recipient_user_ids: ['not-a-uuid'],
      }),
    ).rejects.toThrow('Follower IDs must be valid UUIDs')
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('rejects follower bodies with unexpected fields before the request', async () => {
    const allFollowersWithRecipients = {
      audience: 'all_followers',
      recipient_user_ids: [],
    } as const
    await expect(sendPostToFollowers('post-1', allFollowersWithRecipients)).rejects.toThrow(
      'All-followers sends cannot include recipient IDs',
    )

    const selectedFollowersWithUnexpectedField = {
      audience: 'selected_followers',
      recipient_user_ids: ['01900000-0000-7000-8000-000000000001'],
      unexpected_field: true,
    } as const
    await expect(
      sendPostToFollowers('post-1', selectedFollowersWithUnexpectedField),
    ).rejects.toThrow('Selected-follower sends contain unexpected fields')

    expect(mockPost).not.toHaveBeenCalled()
  })
})
