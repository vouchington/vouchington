import { describe, expect, it, vi } from 'vitest'

const { mockPost, mockDelete } = vi.hoisted(() => ({
  mockPost: vi.fn<VitestLooseMock>(),
  mockDelete: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/lib/api/client/instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
        delete: mockDelete,
      },
    }) as unknown as typeof import('@/lib/api/client/instance'),
)

import { beginBlueskyAccountLink, disconnectBlueskyAccount } from '@/lib/api/client/auth'

describe('bluesky account link client helpers', () => {
  it('beginBlueskyAccountLink posts the handle and returns the redirect URL', async () => {
    mockPost.mockResolvedValue({ redirect_url: 'https://bsky.social/oauth/authorize' })

    await expect(beginBlueskyAccountLink('alice.bsky.social')).resolves.toEqual({
      redirect_url: 'https://bsky.social/oauth/authorize',
    })
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/bluesky/link', {
      handle: 'alice.bsky.social',
    })
  })

  it('disconnectBlueskyAccount deletes the link endpoint', async () => {
    mockDelete.mockResolvedValue(undefined)

    await disconnectBlueskyAccount()

    expect(mockDelete).toHaveBeenCalledWith('/api/v1/auth/bluesky/link')
  })
})
