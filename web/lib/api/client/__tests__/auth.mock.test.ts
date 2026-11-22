import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPost, mockDelete } = vi.hoisted(() => ({
  mockPost: vi.fn<VitestLooseMock>(),
  mockDelete: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('../instance'),
  () =>
    ({
      clientApi: {
        post: mockPost,
        delete: mockDelete,
      },
    }) as unknown as typeof import('../instance'),
)

import {
  acknowledgeOAuthAuthorization,
  beginOAuthAuthorization,
  completeOAuthAuthorization,
  disconnectOAuthAccount,
  postLogout,
  sendEmailLoginToken,
} from '../auth'

describe('OAuth broker auth client', () => {
  beforeEach(() => {
    mockPost.mockReset()
    mockDelete.mockReset()
  })

  it('posts the email login token request and returns the resend interval', async () => {
    const response = { email_address: 'a@b.test', resend_after_seconds: 60 }
    mockPost.mockResolvedValue(response)

    await expect(sendEmailLoginToken('a@b.test', 'ts-token', undefined, 'en-US')).resolves.toEqual(
      response,
    )
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/email-address/tokens', {
      email_address: 'a@b.test',
      cf_turnstile_response: 'ts-token',
      ui_locale: 'en-US',
      hp_website: '',
      hp_phone: '',
    })
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

    await expect(beginOAuthAuthorization('github', 'connect', 'reauth-token')).resolves.toEqual(
      response,
    )
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/oauth/github/authorizations', {
      purpose: 'connect',
      re_auth_token: 'reauth-token',
      callback_mode: 'web',
    })
  })

  it('begins a LinkedIn web connection through the broker endpoint', async () => {
    const response = {
      flow_id: 'linkedin-flow',
      redirect_url: 'https://www.linkedin.com/oauth/v2/authorization',
      expires_at: '2026-07-30T00:00:00.000Z',
    }
    mockPost.mockResolvedValue(response)

    await expect(beginOAuthAuthorization('linkedin', 'connect', 'reauth-token')).resolves.toEqual(
      response,
    )
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/oauth/linkedin/authorizations', {
      purpose: 'connect',
      re_auth_token: 'reauth-token',
      callback_mode: 'web',
    })
  })

  it('begins a Microsoft web connection through the broker endpoint', async () => {
    const response = {
      flow_id: 'microsoft-flow',
      redirect_url: 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
      expires_at: '2026-07-30T00:00:00.000Z',
    }
    mockPost.mockResolvedValue(response)

    await expect(beginOAuthAuthorization('microsoft', 'connect', 'reauth-token')).resolves.toEqual(
      response,
    )
    expect(mockPost).toHaveBeenCalledWith('/api/v1/auth/oauth/microsoft/authorizations', {
      purpose: 'connect',
      re_auth_token: 'reauth-token',
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

  it('disconnects an OAuth account only with its fresh account-change proof', async () => {
    mockDelete.mockResolvedValue(undefined)

    await expect(disconnectOAuthAccount('github', 'fresh-proof')).resolves.toBeUndefined()
    expect(mockDelete).toHaveBeenCalledWith('/api/v1/auth/oauth/github/connect', {
      body: { re_auth_token: 'fresh-proof' },
    })
  })
})
