import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The web Vitest setup mocks this hook globally so forms get a ready token; restore the real
// implementation here so we exercise its token-state + reset bookkeeping.
vi.mock(import('@/hooks/use-turnstile-token'), async importActual => importActual())

const turnstileReset = vi.hoisted(() => vi.fn<VitestLooseMock>())
const useTurnstileActionMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => ({ ref: () => {}, reset: turnstileReset, isError: false })),
)
vi.mock(import('@/hooks/use-turnstile-action'), () => ({
  useTurnstileAction: useTurnstileActionMock,
}))

const fetchCaptchaConfigMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => Promise.resolve({ always_approve: false })),
)
vi.mock(import('@/lib/api/client/captcha-config'), () => ({
  fetchCaptchaConfig: fetchCaptchaConfigMock,
}))

import { useTurnstileToken } from '@/hooks/use-turnstile-token'
import { TURNSTILE_ALWAYS_APPROVE_TOKEN } from '@/hooks/use-turnstile-always-approve'

function getOptions() {
  return useTurnstileActionMock.mock.lastCall![0]
}

describe('useTurnstileToken', () => {
  beforeEach(() => {
    fetchCaptchaConfigMock.mockResolvedValue({ always_approve: false })
    useTurnstileActionMock.mockClear()
    turnstileReset.mockClear()
  })

  it('starts with no token and captures it on success', () => {
    const { result } = renderHook(() => useTurnstileToken('posts.create'))
    expect(result.current.token).toBeNull()

    void act(() => getOptions().onSuccess('token-123'))
    expect(result.current.token).toBe('token-123')
  })

  it('clears a solved token when the form switches to a different protected operation', () => {
    const view = renderHook(({ actionTag }) => useTurnstileToken(actionTag), {
      initialProps: { actionTag: 'posts.create' },
    })
    void act(() => getOptions().onSuccess('posts-token'))
    expect(view.result.current.token).toBe('posts-token')
    view.rerender({ actionTag: 'communities.create-post' })
    expect(view.result.current.token).toBeNull()
    expect(getOptions().actionTag).toBe('communities.create-post')
  })

  it('reset() clears the token and resets the widget', () => {
    const { result } = renderHook(() => useTurnstileToken('posts.create'))
    void act(() => getOptions().onSuccess('token-123'))
    expect(result.current.token).toBe('token-123')

    act(() => result.current.reset())
    expect(result.current.token).toBeNull()
    expect(turnstileReset).toHaveBeenCalledTimes(1)
  })

  it('clears the token when the challenge expires or errors', () => {
    const { result } = renderHook(() => useTurnstileToken('posts.create'))

    void act(() => getOptions().onSuccess('token-123'))
    void act(() => getOptions().onExpire())
    expect(result.current.token).toBeNull()

    void act(() => getOptions().onSuccess('token-456'))
    expect(result.current.token).toBe('token-456')
    void act(() => getOptions().onError())
    expect(result.current.token).toBeNull()
  })

  it('surfaces isError from the Turnstile widget', () => {
    useTurnstileActionMock.mockReturnValueOnce({
      ref: () => {},
      reset: turnstileReset,
      isError: true,
    })
    const { result } = renderHook(() => useTurnstileToken('posts.create'))
    expect(result.current.isError).toBe(true)
    expect(result.current.token).toBeNull()
  })

  it('disables the widget and supplies a dummy token when always-approve is on', async () => {
    fetchCaptchaConfigMock.mockResolvedValue({ always_approve: true })
    useTurnstileActionMock.mockReturnValue({
      ref: () => {},
      reset: turnstileReset,
      isError: true,
    })
    const { result } = renderHook(() => useTurnstileToken('posts.create'))

    await waitFor(() => {
      expect(result.current.alwaysApprove).toBe(true)
    })
    expect(result.current.token).toBe(TURNSTILE_ALWAYS_APPROVE_TOKEN)
    expect(result.current.isError).toBe(false)
    expect(getOptions().enabled).toBe(false)
  })
})
