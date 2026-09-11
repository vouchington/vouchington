import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import {
  clearRuntimePublicConfigForTest,
  setRuntimePublicConfigForTest,
} from '@/test-helpers/runtime-public-config'

// The web Vitest setup mocks this hook globally; restore the real implementation here.
vi.mock(import('@/hooks/use-recaptcha-token'), async importActual => importActual())

const useLoadScriptMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => ({ isLoaded: true, isError: false })),
)
vi.mock(import('@/hooks/use-load-script'), () => ({ useLoadScript: useLoadScriptMock }))

import { useRecaptchaToken } from '@/hooks/use-recaptcha-token'

const SITE_KEY = 'test-site-key'

describe('useRecaptchaToken', () => {
  beforeEach(() => {
    useLoadScriptMock.mockClear()
  })

  afterEach(() => {
    delete (window as any).grecaptcha
    clearRuntimePublicConfigForTest()
  })

  it('returns null and loads no script when the site key is unset', async () => {
    setRuntimePublicConfigForTest({})
    const { result } = renderHook(() => useRecaptchaToken())
    expect(useLoadScriptMock).toHaveBeenCalledWith('')

    const token = await result.current.execute('create_post')
    expect(token).toBeNull()
  })

  it('mints a token via grecaptcha.enterprise.execute when configured', async () => {
    setRuntimePublicConfigForTest({ recaptchaSiteKey: SITE_KEY })
    const execute = vi.fn<VitestLooseMock>(() => Promise.resolve('minted-token'))
    ;(window as any).grecaptcha = {
      enterprise: { ready: (cb: () => void) => cb(), execute },
    }
    const { result } = renderHook(() => useRecaptchaToken())
    expect(useLoadScriptMock).toHaveBeenCalledWith(
      `https://www.google.com/recaptcha/enterprise.js?render=${SITE_KEY}`,
    )

    const token = await result.current.execute('create_comment')
    expect(token).toBe('minted-token')
    expect(execute).toHaveBeenCalledWith(SITE_KEY, { action: 'create_comment' })
  })

  it('returns null when grecaptcha is not present on the window', async () => {
    setRuntimePublicConfigForTest({ recaptchaSiteKey: SITE_KEY })
    const { result } = renderHook(() => useRecaptchaToken())
    const token = await result.current.execute('create_post')
    expect(token).toBeNull()
  })

  it('returns null when execute rejects', async () => {
    setRuntimePublicConfigForTest({ recaptchaSiteKey: SITE_KEY })
    ;(window as any).grecaptcha = {
      enterprise: {
        ready: (cb: () => void) => cb(),
        execute: vi.fn<VitestLooseMock>(() => Promise.reject(new Error('boom'))),
      },
    }
    const { result } = renderHook(() => useRecaptchaToken())
    const token = await result.current.execute('create_post')
    expect(token).toBeNull()
  })
})
