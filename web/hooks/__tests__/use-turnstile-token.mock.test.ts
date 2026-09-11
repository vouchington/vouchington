import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The web Vitest setup mocks this hook globally so forms get a ready token; restore the real
// implementation here so we exercise its token-state + reset bookkeeping.
vi.mock(import('@/hooks/use-turnstile-token'), async importActual => importActual())

const useLoadScriptMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => ({ isLoaded: true, isError: false })),
)
vi.mock(import('@/hooks/use-load-script'), () => ({ useLoadScript: useLoadScriptMock }))

const fetchCaptchaConfigMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => Promise.resolve({ always_approve: false })),
)
vi.mock(import('@/lib/api/client/captcha-config'), () => ({
  fetchCaptchaConfig: fetchCaptchaConfigMock,
}))

import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { TURNSTILE_ALWAYS_APPROVE_TOKEN } from '@/hooks/use-turnstile-always-approve'

function getRenderOptions() {
  return (window as any).turnstile.render.mock.calls[0][1]
}

describe('useTurnstileToken', () => {
  beforeEach(() => {
    fetchCaptchaConfigMock.mockResolvedValue({ always_approve: false })
    useLoadScriptMock.mockReturnValue({ isLoaded: true, isError: false })
    ;(window as any).turnstile = {
      render: vi.fn<VitestLooseMock>(() => 'widget-id'),
      remove: vi.fn<VitestLooseMock>(),
      reset: vi.fn<VitestLooseMock>(),
    }
  })

  afterEach(() => {
    delete (window as any).turnstile
  })

  function renderAndAttach() {
    const view = renderHook(() => useTurnstileToken())
    act(() => {
      view.result.current.containerRef(document.createElement('div'))
    })
    return view
  }

  it('starts with no token and captures it on success', () => {
    const { result } = renderAndAttach()
    expect(result.current.token).toBeNull()

    void act(() => getRenderOptions().callback('token-123'))
    expect(result.current.token).toBe('token-123')
  })

  it('reset() clears the token and resets the widget', () => {
    const { result } = renderAndAttach()
    void act(() => getRenderOptions().callback('token-123'))
    expect(result.current.token).toBe('token-123')

    act(() => result.current.reset())
    expect(result.current.token).toBeNull()
    expect((window as any).turnstile.reset).toHaveBeenCalledWith('widget-id')
  })

  it('clears the token when the challenge expires or errors', () => {
    const { result } = renderAndAttach()
    const options = getRenderOptions()

    void act(() => options.callback('token-123'))
    void act(() => options['expired-callback']())
    expect(result.current.token).toBeNull()

    void act(() => options.callback('token-456'))
    expect(result.current.token).toBe('token-456')
    void act(() => options['error-callback']())
    expect(result.current.token).toBeNull()
  })

  it('surfaces isError when the Turnstile script fails to load', () => {
    useLoadScriptMock.mockReturnValue({ isLoaded: false, isError: true })
    const { result } = renderHook(() => useTurnstileToken())
    expect(result.current.isError).toBe(true)
    expect(result.current.token).toBeNull()
  })

  it('skips the widget and supplies a dummy token when always-approve is on', async () => {
    fetchCaptchaConfigMock.mockResolvedValue({ always_approve: true })
    const { result } = renderHook(() => useTurnstileToken())

    await waitFor(() => {
      expect(result.current.alwaysApprove).toBe(true)
    })
    expect(result.current.token).toBe(TURNSTILE_ALWAYS_APPROVE_TOKEN)
    expect(result.current.isError).toBe(false)
    expect(useLoadScriptMock).toHaveBeenCalledWith('')
  })
})
