import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useGithubAuth } from '../use-github-auth'
import { useLinkedInAuth } from '../use-linkedin-auth'
import { useMicrosoftAuth } from '../use-microsoft-auth'
import { useXAuth } from '../use-x-auth'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

const runPopupOAuthLoginMock = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@vouchington/utils/oauth-popup'), async importOriginal => ({
  ...(await importOriginal()),
  runPopupOAuthLogin: runPopupOAuthLoginMock,
}))

type PopupConfig = {
  clientId: string
  authUrl: string | (() => string)
  mapResult: (result: { code: string; codeVerifier?: string; redirectUri: string }) => unknown
}

function lastConfig(): PopupConfig {
  return runPopupOAuthLoginMock.mock.calls.at(-1)![0] as PopupConfig
}

describe('OAuth popup provider wrappers', () => {
  afterEach(() => {
    vi.clearAllMocks()
    clearRuntimePublicConfigForTest()
  })

  it.each([
    {
      runtimeConfig: { githubClientId: 'github-client-id' },
      useAuth: useGithubAuth,
      expected: {
        clientId: 'github-client-id',
        authUrl: 'https://github.com/login/oauth/authorize',
        callbackPath: '/auth/callback/github',
        popupName: 'github-oauth',
        provider: 'github',
        providerLabel: 'GitHub',
        scope: 'read:user user:email',
      },
      result: { code: 'code-123', redirectUri: 'https://app/cb' },
    },
    {
      runtimeConfig: { xClientId: 'x-client-id' },
      useAuth: useXAuth,
      expected: {
        clientId: 'x-client-id',
        authUrl: 'https://x.com/i/oauth2/authorize',
        callbackPath: '/auth/callback/x',
        popupName: 'x-oauth',
        provider: 'x',
        providerLabel: 'X',
        scope: 'tweet.read users.read',
        responseType: 'code',
        pkce: true,
      },
      result: { code: 'code-123', codeVerifier: 'verifier-123', redirectUri: 'https://app/cb' },
    },
    {
      runtimeConfig: { linkedinClientId: 'linkedin-client-id' },
      useAuth: useLinkedInAuth,
      expected: {
        clientId: 'linkedin-client-id',
        authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
        callbackPath: '/auth/callback/linkedin',
        popupName: 'linkedin-oauth',
        provider: 'linkedin',
        providerLabel: 'LinkedIn',
        scope: 'openid profile email',
        responseType: 'code',
        pkce: true,
      },
      result: { code: 'code-123', codeVerifier: 'verifier-123', redirectUri: 'https://app/cb' },
    },
  ])('configures the shared popup login for $expected.provider', async config => {
    setRuntimePublicConfigForTest(config.runtimeConfig)
    runPopupOAuthLoginMock.mockImplementation(async (popup: PopupConfig) =>
      popup.mapResult(config.result),
    )
    const { result } = renderHook(() => config.useAuth())

    await expect(result.current.login()).resolves.toEqual(config.result)

    expect(result.current).toMatchObject({ isAvailable: true, isLoaded: true })
    expect(lastConfig()).toMatchObject(config.expected)
  })

  it('uses the Microsoft tenant fallback and response_mode=query', async () => {
    setRuntimePublicConfigForTest({ microsoftClientId: 'microsoft-client-id' })
    runPopupOAuthLoginMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMicrosoftAuth())
    await result.current.login()

    const config = lastConfig()
    expect((config.authUrl as () => string)()).toBe(
      'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    )
    expect(config).toMatchObject({
      scope: 'openid profile email User.Read',
      responseMode: 'query',
      pkce: true,
    })
  })

  it('uses a configured Microsoft tenant', async () => {
    setRuntimePublicConfigForTest({
      microsoftClientId: 'microsoft-client-id',
      microsoftTenantId: 'organizations',
    })
    runPopupOAuthLoginMock.mockResolvedValue(undefined)

    const { result } = renderHook(() => useMicrosoftAuth())
    await result.current.login()

    expect((lastConfig().authUrl as () => string)()).toBe(
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    )
  })

  it('guards popup providers against concurrent login attempts', async () => {
    setRuntimePublicConfigForTest({ githubClientId: 'github-client-id' })
    let resolvePopup: (value: string) => void = () => {}
    runPopupOAuthLoginMock.mockReturnValue(
      new Promise(resolve => {
        resolvePopup = resolve
      }),
    )

    const { result } = renderHook(() => useGithubAuth())
    const firstLogin = result.current.login()

    await expect(result.current.login()).rejects.toThrow('login already in progress')
    expect(runPopupOAuthLoginMock).toHaveBeenCalledTimes(1)

    resolvePopup('done')
    await expect(firstLogin).resolves.toBe('done')
    runPopupOAuthLoginMock.mockResolvedValue('again')
    await expect(result.current.login()).resolves.toBe('again')
  })
})
