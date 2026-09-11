import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTurnstile } from './use-turnstile'

const useLoadScriptMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => ({ isLoaded: true, isError: false })),
)

vi.mock(import('./use-load-script'), () => ({
  useLoadScript: useLoadScriptMock,
}))

describe('useTurnstile', () => {
  beforeEach(() => {
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

  it('loads the Turnstile script when enabled', async () => {
    renderHook(() =>
      useTurnstile({
        siteKey: 'test-site-key',
        onSuccess: vi.fn<VitestLooseMock>(),
      }),
    )

    expect(useLoadScriptMock).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',
    )
  })

  it('does not load the Turnstile script when disabled', async () => {
    renderHook(() =>
      useTurnstile({
        siteKey: 'test-site-key',
        enabled: false,
        onSuccess: vi.fn<VitestLooseMock>(),
      }),
    )

    expect(useLoadScriptMock).toHaveBeenCalledWith('')
  })

  it('renders the widget when a container is attached', async () => {
    const onSuccess = vi.fn<VitestLooseMock>()
    const { result } = renderHook(() =>
      useTurnstile({
        siteKey: 'test-site-key',
        onSuccess,
      }),
    )

    const node = document.createElement('div')
    act(() => {
      result.current.ref(node)
    })

    expect((window as any).turnstile.render).toHaveBeenCalledWith(
      node,
      expect.objectContaining({ sitekey: 'test-site-key' }),
    )
  })

  it('invokes onError when the script fails to load', async () => {
    useLoadScriptMock.mockReturnValue({ isLoaded: false, isError: true })

    const onError = vi.fn<VitestLooseMock>()
    renderHook(() =>
      useTurnstile({
        siteKey: 'test-site-key',
        onSuccess: vi.fn<VitestLooseMock>(),
        onError,
      }),
    )

    expect(onError).toHaveBeenCalled()
  })

  it('reset() forwards to window.turnstile.reset for the rendered widget', async () => {
    const { result } = renderHook(() =>
      useTurnstile({
        siteKey: 'test-site-key',
        onSuccess: vi.fn<VitestLooseMock>(),
      }),
    )

    act(() => {
      result.current.ref(document.createElement('div'))
    })

    act(() => {
      result.current.reset()
    })

    expect((window as any).turnstile.reset).toHaveBeenCalledWith('widget-id')
  })

  it('triggers onSuccess, onExpire, and onError callbacks from Turnstile', async () => {
    const onSuccess = vi.fn<VitestLooseMock>()
    const onExpire = vi.fn<VitestLooseMock>()
    const onError = vi.fn<VitestLooseMock>()

    const { result } = renderHook(() =>
      useTurnstile({
        siteKey: 'test-site-key',
        onSuccess,
        onExpire,
        onError,
      }),
    )

    const node = document.createElement('div')
    act(() => {
      result.current.ref(node)
    })

    const renderCalls = (window as any).turnstile.render.mock.calls
    expect(renderCalls.length).toBe(1)
    const renderOptions = renderCalls[0][1]

    // Manually invoke turnstile callbacks to ensure coverage
    renderOptions.callback('test-token')
    expect(onSuccess).toHaveBeenCalledWith('test-token')

    renderOptions['expired-callback']()
    expect(onExpire).toHaveBeenCalled()

    renderOptions['error-callback']()
    expect(onError).toHaveBeenCalled()
  })
})
