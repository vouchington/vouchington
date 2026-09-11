import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGithubAuth } from '../use-github-auth'
import { useLinkedInAuth } from '../use-linkedin-auth'
import { useMicrosoftAuth } from '../use-microsoft-auth'
import { useXAuth } from '../use-x-auth'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

const useLoadScriptMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => ({ isLoaded: true, isError: false })),
)
const openOAuthPopupMock = vi.hoisted(() => vi.fn<VitestLooseMock>())
const generateStateMock = vi.hoisted(() => vi.fn<VitestLooseMock>(() => 'state-123'))
const generateCodeVerifierMock = vi.hoisted(() => vi.fn<VitestLooseMock>(() => 'verifier-123'))
const generateCodeChallengeMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => Promise.resolve('challenge-123')),
)

function callbackUrl(path: string): string {
  return `${window.location.origin}${path}`
}

vi.mock(import('../use-load-script'), () => ({
  useLoadScript: useLoadScriptMock,
}))

vi.mock(import('@/lib/auth/open-oauth-popup'), () => ({
  openOAuthPopup: openOAuthPopupMock,
}))

vi.mock(import('@/lib/auth/pkce'), () => ({
  generateState: generateStateMock,
  generateCodeVerifier: generateCodeVerifierMock,
  generateCodeChallenge: generateCodeChallengeMock,
}))

describe('OAuth popup provider wrappers', () => {
  beforeEach(() => {
    openOAuthPopupMock.mockResolvedValue({ code: 'code-123' })
    generateStateMock.mockReturnValue('state-123')
    generateCodeVerifierMock.mockReturnValue('verifier-123')
    generateCodeChallengeMock.mockResolvedValue('challenge-123')
  })

  afterEach(() => {
    vi.clearAllMocks()
    clearRuntimePublicConfigForTest()
  })

  it('builds GitHub popup auth URLs and returns the code with redirectUri', async () => {
    setRuntimePublicConfigForTest({ githubClientId: 'github-client-id' })

    const { result } = renderHook(() => useGithubAuth())

    await expect(result.current.login()).resolves.toEqual({
      code: 'code-123',
      redirectUri: callbackUrl('/auth/callback/github'),
    })

    expect(result.current).toMatchObject({ isAvailable: true, isLoaded: true })
    expect(openOAuthPopupMock).toHaveBeenCalledWith({
      authUrl: expect.any(URL),
      popupName: 'github-oauth',
      provider: 'github',
      providerLabel: 'GitHub',
      state: 'state-123',
    })
    const { authUrl } = openOAuthPopupMock.mock.calls[0]![0] as { authUrl: URL }
    expect(authUrl.origin + authUrl.pathname).toBe('https://github.com/login/oauth/authorize')
    expect(authUrl.searchParams.get('client_id')).toBe('github-client-id')
    expect(authUrl.searchParams.get('redirect_uri')).toBe(callbackUrl('/auth/callback/github'))
    expect(authUrl.searchParams.get('scope')).toBe('read:user user:email')
    expect(authUrl.searchParams.get('state')).toBe('state-123')
    expect(authUrl.searchParams.has('code_challenge')).toBe(false)
  })

  it('guards popup providers against concurrent login attempts', async () => {
    setRuntimePublicConfigForTest({ githubClientId: 'github-client-id' })
    let resolvePopup: (value: { code: string }) => void = () => {}
    openOAuthPopupMock.mockReturnValue(
      new Promise(resolve => {
        resolvePopup = resolve
      }),
    )

    const { result } = renderHook(() => useGithubAuth())
    const firstLogin = result.current.login()

    await expect(result.current.login()).rejects.toThrow('login already in progress')
    expect(openOAuthPopupMock).toHaveBeenCalledTimes(1)

    resolvePopup({ code: 'code-after-wait' })
    await expect(firstLogin).resolves.toEqual({
      code: 'code-after-wait',
      redirectUri: callbackUrl('/auth/callback/github'),
    })
  })

  it.each([
    {
      runtimeConfig: { xClientId: 'x-client-id' },
      clientId: 'x-client-id',
      useAuth: useXAuth,
      originPath: 'https://x.com/i/oauth2/authorize',
      redirectUri: callbackUrl('/auth/callback/x'),
      scope: 'tweet.read users.read',
      popupName: 'x-oauth',
      provider: 'x',
      providerLabel: 'X',
    },
    {
      runtimeConfig: { linkedinClientId: 'linkedin-client-id' },
      clientId: 'linkedin-client-id',
      useAuth: useLinkedInAuth,
      originPath: 'https://www.linkedin.com/oauth/v2/authorization',
      redirectUri: callbackUrl('/auth/callback/linkedin'),
      scope: 'openid profile email',
      popupName: 'linkedin-oauth',
      provider: 'linkedin',
      providerLabel: 'LinkedIn',
    },
  ])('builds PKCE popup auth URLs for $provider', async config => {
    setRuntimePublicConfigForTest(config.runtimeConfig)
    const { result } = renderHook(() => config.useAuth())

    await expect(result.current.login()).resolves.toEqual({
      code: 'code-123',
      codeVerifier: 'verifier-123',
      redirectUri: config.redirectUri,
    })

    expect(openOAuthPopupMock).toHaveBeenCalledWith({
      authUrl: expect.any(URL),
      popupName: config.popupName,
      provider: config.provider,
      providerLabel: config.providerLabel,
      state: 'state-123',
    })
    const { authUrl } = openOAuthPopupMock.mock.calls[0]![0] as { authUrl: URL }
    expect(authUrl.origin + authUrl.pathname).toBe(config.originPath)
    expect(authUrl.searchParams.get('response_type')).toBe('code')
    expect(authUrl.searchParams.get('client_id')).toBe(config.clientId)
    expect(authUrl.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    expect(authUrl.searchParams.get('scope')).toBe(config.scope)
    expect(authUrl.searchParams.get('state')).toBe('state-123')
    expect(authUrl.searchParams.get('code_challenge')).toBe('challenge-123')
    expect(authUrl.searchParams.get('code_challenge_method')).toBe('S256')
  })

  it('uses the Microsoft tenant fallback and response_mode=query', async () => {
    setRuntimePublicConfigForTest({ microsoftClientId: 'microsoft-client-id' })

    const { result } = renderHook(() => useMicrosoftAuth())

    await expect(result.current.login()).resolves.toEqual({
      code: 'code-123',
      codeVerifier: 'verifier-123',
      redirectUri: callbackUrl('/auth/callback/microsoft'),
    })

    const { authUrl } = openOAuthPopupMock.mock.calls[0]![0] as { authUrl: URL }
    expect(authUrl.origin + authUrl.pathname).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    )
    expect(authUrl.searchParams.get('scope')).toBe('openid profile email User.Read')
    expect(authUrl.searchParams.get('response_mode')).toBe('query')
  })

  it('uses a configured Microsoft tenant', async () => {
    setRuntimePublicConfigForTest({
      microsoftClientId: 'microsoft-client-id',
      microsoftTenantId: 'organizations',
    })

    const { result } = renderHook(() => useMicrosoftAuth())

    await expect(result.current.login()).resolves.toEqual({
      code: 'code-123',
      codeVerifier: 'verifier-123',
      redirectUri: callbackUrl('/auth/callback/microsoft'),
    })

    const { authUrl } = openOAuthPopupMock.mock.calls[0]![0] as { authUrl: URL }
    expect(authUrl.origin + authUrl.pathname).toBe(
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    )
  })
})
