import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPost = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
      },
    }) as unknown as typeof import('../instance'),
)

import {
  acknowledgeOAuthAuthorization,
  beginOAuthAuthorization,
  completeOAuthAuthorization,
  postLogout,
} from '../auth'

describe('OAuth broker auth client', () => {
  beforeEach(() => {
    mockPost.mockReset()
  })

  it('acknowledges a consumed web completion result', async () => {
    mockPost.mockResolvedValue(undefined)

    await expect(acknowledgeOAuthAuthorization('flow-1')).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/oauth/authorizations/flow-1/complete', {
      acknowledge: true,
    })
  })

  it('begins a web authorization for the selected provider and purpose', async () => {
    const response = {
      flow_id: 'flow-1',
      redirect_url: 'https://github.com/login/oauth/authorize',
      expires_at: '2026-07-30T00:00:00.000Z',
    }
    mockPost.mockResolvedValue(response)

    await expect(beginOAuthAuthorization('github', 'connect')).resolves.toEqual(response)
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/oauth/github/authorizations', {
      purpose: 'connect',
      callback_mode: 'web',
    })
  })

  it('completes the authorization with its opaque flow id', async () => {
    mockPost.mockResolvedValue({ user: { id: 'user-1' } })

    await expect(completeOAuthAuthorization('flow-1')).resolves.toEqual({
      user: { id: 'user-1' },
    })
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/oauth/authorizations/flow-1/complete', {})
  })

  it('posts logout without a push binding', async () => {
    mockPost.mockResolvedValue(undefined)

    await expect(postLogout()).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/logout')
  })

  it('posts logout with the exact push binding', async () => {
    mockPost.mockResolvedValue(undefined)
    const binding = {
      web_push_endpoint: 'https://push.example.test/subscription',
      web_push_subscription_id: '0198fcb7-6c00-7000-8000-000000000001',
    }

    await expect(postLogout(binding)).resolves.toBeUndefined()
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/logout', binding)
  })
})
