import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppleAuth } from '../use-apple-auth'
import { useGoogleAuth } from '../use-google-auth'
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

interface GooglePromptNotification {
  isNotDisplayed: () => boolean
  isSkippedMoment: () => boolean
}

describe('OAuth native Apple wrapper', () => {
  beforeEach(() => {
    setRuntimePublicConfigForTest({ appleClientId: 'apple-client-id' })
    useLoadScriptMock.mockReturnValue({ isLoaded: true, isError: false })
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(array => {
      if (!array) return array
      const bytes = array as unknown as Uint8Array
      for (let i = 0; i < bytes.length; i += 1) {
        bytes[i] = i
      }
      return array
    })
    ;(window as any).AppleID = {
      auth: {
        init: vi.fn<VitestLooseMock>(),
        signIn: vi.fn<VitestLooseMock>().mockResolvedValue({
          authorization: { id_token: 'apple-id-token', code: 'apple-code' },
          user: { name: { firstName: 'Ada', lastName: 'Lovelace' } },
        }),
      },
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.clearAllMocks()
    delete (window as any).AppleID
    clearRuntimePublicConfigForTest()
  })

  it('loads the Apple script and maps signIn tokens, nonce, and user name', async () => {
    const { result } = renderHook(() => useAppleAuth())

    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    await expect(result.current.login()).resolves.toEqual({
      token: 'apple-id-token',
      nonce: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      userData: { name: 'Ada Lovelace' },
    })

    expect(useLoadScriptMock).toHaveBeenCalledWith(
      'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js',
    )
    expect((window as any).AppleID.auth.init).toHaveBeenCalledWith({
      clientId: 'apple-client-id',
      scope: 'name email',
      redirectURI: callbackUrl('/auth/callback/apple'),
      usePopup: true,
      nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('converts Apple signIn failures into OAuthCancelledError', async () => {
    ;(window as any).AppleID.auth.signIn.mockRejectedValue(new Error('closed'))

    const { result } = renderHook(() => useAppleAuth())

    await expect(result.current.login()).rejects.toMatchObject({ name: 'OAuthCancelledError' })
  })

  it('treats the Apple script load event as ready when the SDK exposes no ready callback', async () => {
    delete (window as any).AppleID

    const { result } = renderHook(() => useAppleAuth())

    expect(result.current.isLoaded).toBe(true)
    await expect(result.current.login()).rejects.toThrow('Apple Sign In not loaded')
  })

  it('keeps Apple unloaded when the script fails to load', () => {
    useLoadScriptMock.mockReturnValue({ isLoaded: false, isError: true })

    const { result } = renderHook(() => useAppleAuth())

    expect(result.current.isLoaded).toBe(false)
  })

  it('omits Apple userData when the provider response has no name', async () => {
    ;(window as any).AppleID.auth.signIn.mockResolvedValue({
      authorization: { id_token: 'apple-id-token', code: 'apple-code' },
    })

    const { result } = renderHook(() => useAppleAuth())

    await expect(result.current.login()).resolves.toEqual({
      token: 'apple-id-token',
      nonce: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
      userData: undefined,
    })
  })

  it('guards Apple signIn against concurrent login attempts', async () => {
    let resolveSignIn: (value: {
      authorization: { id_token: string; code: string }
      user?: { name?: { firstName?: string; lastName?: string } }
    }) => void = () => {}
    ;(window as any).AppleID.auth.signIn.mockReturnValue(
      new Promise(resolve => {
        resolveSignIn = resolve
      }),
    )

    const { result } = renderHook(() => useAppleAuth())
    const firstLogin = result.current.login()

    await expect(result.current.login()).rejects.toThrow('login already in progress')
    await waitFor(() => expect((window as any).AppleID.auth.signIn).toHaveBeenCalledTimes(1))

    resolveSignIn({ authorization: { id_token: 'apple-id-token', code: 'apple-code' } })
    await expect(firstLogin).resolves.toMatchObject({
      token: 'apple-id-token',
      nonce: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    })
  })
})

describe('OAuth native Google wrapper', () => {
  beforeEach(() => {
    setRuntimePublicConfigForTest({ googleClientId: 'google-client-id' })
    useLoadScriptMock.mockReturnValue({ isLoaded: true, isError: false })
    ;(window as any).google = {
      accounts: {
        id: {
          initialize: vi.fn<VitestLooseMock>(),
          prompt: vi.fn<VitestLooseMock>(),
        },
      },
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete (window as any).google
    clearRuntimePublicConfigForTest()
  })

  it('initializes Google Identity Services and resolves credentials', async () => {
    ;(window as any).google.accounts.id.prompt.mockImplementation(() => {})

    const { result } = renderHook(() => useGoogleAuth())
    const credentialPromise = result.current.login()

    const initializeConfig = (window as any).google.accounts.id.initialize.mock.calls[0]![0]
    initializeConfig.callback({ credential: 'google-credential' })

    await expect(credentialPromise).resolves.toBe('google-credential')
    await waitFor(() => expect(result.current.isLoaded).toBe(true))
    expect(useLoadScriptMock).toHaveBeenCalledWith('https://accounts.google.com/gsi/client')
    expect(initializeConfig.client_id).toBe('google-client-id')
  })

  it('rejects Google callbacks without a credential as OAuth cancellations', async () => {
    ;(window as any).google.accounts.id.prompt.mockImplementation(() => {})

    const { result } = renderHook(() => useGoogleAuth())
    const credentialPromise = result.current.login()

    const initializeConfig = (window as any).google.accounts.id.initialize.mock.calls[0]![0]
    initializeConfig.callback({})

    await expect(credentialPromise).rejects.toMatchObject({ name: 'OAuthCancelledError' })
  })

  it('rejects when Google script APIs are unavailable', async () => {
    delete (window as any).google

    const { result } = renderHook(() => useGoogleAuth())

    expect(result.current.isLoaded).toBe(false)
    await expect(result.current.login()).rejects.toThrow('Google Identity Services not loaded')
  })

  it('waits for the Google SDK load callback before marking the API loaded', async () => {
    delete (window as any).google

    const { result } = renderHook(() => useGoogleAuth())

    expect(result.current.isLoaded).toBe(false)

    ;(window as any).google = {
      accounts: {
        id: {
          initialize: vi.fn<VitestLooseMock>(),
          prompt: vi.fn<VitestLooseMock>(),
        },
      },
    }
    act(() => {
      window.onGoogleLibraryLoad?.()
    })

    await waitFor(() => expect(result.current.isLoaded).toBe(true))
  })

  it('rejects skipped Google prompts as OAuth cancellations', async () => {
    ;(window as any).google.accounts.id.prompt.mockImplementation(
      (callback: (notification: GooglePromptNotification) => void) => {
        callback({
          isNotDisplayed: () => false,
          isSkippedMoment: () => true,
        })
      },
    )

    const { result } = renderHook(() => useGoogleAuth())

    await expect(result.current.login()).rejects.toMatchObject({ name: 'OAuthCancelledError' })
  })

  it('guards against concurrent Google logins until the callback settles', async () => {
    ;(window as any).google.accounts.id.prompt.mockImplementation(() => {})

    const { result } = renderHook(() => useGoogleAuth())
    const firstLogin = result.current.login()

    await expect(result.current.login()).rejects.toThrow('login already in progress')

    const initializeConfig = (window as any).google.accounts.id.initialize.mock.calls[0]![0]
    act(() => {
      initializeConfig.callback({ credential: 'google-credential' })
    })
    await expect(firstLogin).resolves.toBe('google-credential')
  })

  it('does not install the Google SDK load callback when Google is unavailable', () => {
    setRuntimePublicConfigForTest({})
    const existingCallback = vi.fn<VitestLooseMock>()
    window.onGoogleLibraryLoad = existingCallback

    const { result } = renderHook(() => useGoogleAuth())

    expect(result.current).toMatchObject({ isAvailable: false, isLoaded: false })
    expect(window.onGoogleLibraryLoad).toBe(existingCallback)
    expect(useLoadScriptMock).toHaveBeenCalledWith('')
  })
})
