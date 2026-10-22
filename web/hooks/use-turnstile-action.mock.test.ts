import { act, renderHook } from '@testing-library/react'
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
    const view = renderHook(({ actionTag }) =>
      useTurnstileAction({ actionTag, onSuccess: vi.fn<(token: string) => void>(), siteKey: 'site' }),
    , { initialProps: { actionTag: 'posts.create' } })
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
})
