import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { renderHook as renderHookType } from '@testing-library/react'
import type { useFacebookSDK as useFacebookSDKType } from './use-facebook-sdk'
import type {
  clearRuntimePublicConfigForTest as clearRuntimeConfigType,
  setRuntimePublicConfigForTest as setRuntimeConfigType,
} from '@/test-helpers/runtime-public-config'

let renderHook: typeof renderHookType
let cleanup: typeof import('@testing-library/react/pure').cleanup
let useFacebookSDK: typeof useFacebookSDKType
let clearRuntimePublicConfigForTest: typeof clearRuntimeConfigType
let setRuntimePublicConfigForTest: typeof setRuntimeConfigType

vi.mock(import('@vouchington/script-loader'), () => ({
  useLoadScript: () => ({ isLoaded: true, isError: false }),
}))

describe('useFacebookSDK', () => {
  beforeEach(async () => {
    vi.resetModules()
    const testingLibrary = await vi.importActual<typeof import('@testing-library/react/pure')>(
      '@testing-library/react/pure',
    )
    renderHook = testingLibrary.renderHook
    cleanup = testingLibrary.cleanup
    ;({ useFacebookSDK } =
      await vi.importActual<typeof import('./use-facebook-sdk')>('./use-facebook-sdk'))
    ;({ clearRuntimePublicConfigForTest, setRuntimePublicConfigForTest } = await vi.importActual<
      typeof import('@/test-helpers/runtime-public-config')
    >('@/test-helpers/runtime-public-config'))
    setRuntimePublicConfigForTest({ facebookAppId: 'test-app-id' })
    ;(window as any).FB = {
      init: vi.fn<VitestLooseMock>(),
      login: vi.fn<VitestLooseMock>(),
    }
  })

  afterEach(() => {
    cleanup()
    delete (window as any).FB
    clearRuntimePublicConfigForTest()
  })

  it('surfaces errors thrown by FB.login as regular Error', async () => {
    ;(window as any).FB.login = vi.fn<VitestLooseMock>(() => {
      throw new Error('FB.login cannot be called from http pages')
    })

    const { result } = renderHook(() => useFacebookSDK())
    expect(result.current.isLoaded).toBe(true)

    await expect(result.current.login()).rejects.toThrow(
      'FB.login cannot be called from http pages',
    )
  })

  it('resolves with access token on successful login', async () => {
    ;(window as any).FB.login = vi.fn<VitestLooseMock>((cb: any) => {
      cb({ status: 'connected', authResponse: { accessToken: 'test-token' } })
    })

    const { result } = renderHook(() => useFacebookSDK())
    expect(result.current.isLoaded).toBe(true)

    const token = await result.current.login()
    expect(token).toBe('test-token')
  })

  it('rejects with error when login is not completed', async () => {
    ;(window as any).FB.login = vi.fn<VitestLooseMock>((cb: any) => {
      cb({ status: 'unknown', authResponse: null })
    })

    const { result } = renderHook(() => useFacebookSDK())
    expect(result.current.isLoaded).toBe(true)

    await expect(result.current.login()).rejects.toThrow(
      'Facebook login could not be completed (status: unknown). Please try again.',
    )
  })

  it('rejects with permissions error when user denies authorization', async () => {
    ;(window as any).FB.login = vi.fn<VitestLooseMock>((cb: any) => {
      cb({ status: 'not_authorized', authResponse: null })
    })

    const { result } = renderHook(() => useFacebookSDK())
    expect(result.current.isLoaded).toBe(true)

    await expect(result.current.login()).rejects.toThrow('Facebook permissions were not granted')
  })

  it('does not report loaded before SDK initialization completes', async () => {
    const originalInit = (window as any).FB.init
    ;(window as any).FB.init = vi.fn<VitestLooseMock>(originalInit)

    const { result } = renderHook(() => useFacebookSDK())

    expect((window as any).FB.init).toHaveBeenCalledOnce()
    expect(result.current.isLoaded).toBe(true)
  })

  it('does not report loaded or call login when the SDK global is missing', async () => {
    delete (window as any).FB

    const { result } = renderHook(() => useFacebookSDK())

    expect(result.current.isLoaded).toBe(false)
    await expect(result.current.login()).rejects.toThrow('Facebook SDK is not ready')
  })
})
