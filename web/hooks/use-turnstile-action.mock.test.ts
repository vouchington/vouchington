import { act, renderHook, waitFor } from '@testing-library/react'
import type { TurnstileApi } from '@vouchington/script-loader/turnstile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const useLoadScriptMock = vi.hoisted(() =>
  vi.fn<() => { isError: boolean; isLoaded: boolean }>(() => ({
    isError: false,
    isLoaded: true,
  })),
)
vi.mock(import('@vouchington/script-loader'), () => ({ useLoadScript: useLoadScriptMock }))

import { useTurnstileAction } from './use-turnstile-action'

describe('useTurnstileAction', () => {
  const remove = vi.fn<TurnstileApi['remove']>()
  const render = vi.fn<TurnstileApi['render']>(() => 'widget-id')
  const reset = vi.fn<TurnstileApi['reset']>()

  beforeEach(() => {
    useLoadScriptMock.mockReturnValue({ isError: false, isLoaded: true })
    window.turnstile = {
      getResponse: vi.fn<TurnstileApi['getResponse']>(),
      remove,
      render,
      reset,
    }
  })

  afterEach(() => {
    delete window.turnstile
    vi.clearAllMocks()
  })

  it('renders the provider widget with the mapped operation action', () => {
    const onSuccess = vi.fn<(token: string) => void>()
    const view = renderHook(
      ({ actionTag }) => useTurnstileAction({ actionTag, onSuccess, siteKey: 'site' }),
      { initialProps: { actionTag: 'posts.create' } },
    )
    const container = document.createElement('div')
    act(() => view.result.current.ref(container))

    expect(render).toHaveBeenLastCalledWith(
      container,
      expect.objectContaining({ action: 'posts-create', sitekey: 'site' }),
    )

    view.rerender({ actionTag: 'communities.create-post' })
    expect(remove).toHaveBeenCalledWith('widget-id')
    expect(render).toHaveBeenLastCalledWith(
      container,
      expect.objectContaining({ action: 'communities-create-post' }),
    )
  })

  it('surfaces provider widget errors and clears them when resetting', () => {
    const onError = vi.fn<() => void>()
    const onSuccess = vi.fn<(token: string) => void>()
    const view = renderHook(() =>
      useTurnstileAction({ actionTag: 'posts.create', onError, onSuccess, siteKey: 'site' }),
    )
    act(() => view.result.current.ref(document.createElement('div')))
    const options = render.mock.calls.at(-1)?.[1]

    act(() => options?.['error-callback']?.())
    expect(view.result.current.isError).toBe(true)
    expect(onError).toHaveBeenCalledOnce()

    act(() => view.result.current.reset())
    expect(view.result.current.isError).toBe(false)
    expect(reset).toHaveBeenCalledWith('widget-id')
  })

  it('surfaces a provider render failure', async () => {
    const onError = vi.fn<() => void>()
    const onSuccess = vi.fn<(token: string) => void>()
    render.mockReturnValueOnce(undefined)
    const view = renderHook(() =>
      useTurnstileAction({ actionTag: 'posts.create', onError, onSuccess, siteKey: 'site' }),
    )

    act(() => view.result.current.ref(document.createElement('div')))

    await waitFor(() => expect(view.result.current.isError).toBe(true))
    expect(onError).toHaveBeenCalledOnce()
  })
})
