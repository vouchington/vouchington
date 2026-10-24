import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { TURNSTILE_ALWAYS_APPROVE_TOKEN } from '@/hooks/use-turnstile-always-approve'

vi.mock(import('@/hooks/use-turnstile-action'), () => ({
  useTurnstileAction: () => ({ ref: () => {}, reset: () => {}, isError: false }),
}))

const fetchCaptchaConfigMock = vi.hoisted(() =>
  vi.fn<VitestLooseMock>(() => Promise.resolve({ always_approve: false })),
)
vi.mock(import('@/lib/api/client/captcha-config'), () => ({
  fetchCaptchaConfig: fetchCaptchaConfigMock,
}))

import { useLoginTurnstile } from '@/hooks/use-login-turnstile'

describe('useLoginTurnstile', () => {
  beforeEach(() => {
    fetchCaptchaConfigMock.mockResolvedValue({ always_approve: false })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('keeps a dummy token when always-approve is on', async () => {
    fetchCaptchaConfigMock.mockResolvedValue({ always_approve: true })
    const { result } = renderHook(() => useLoginTurnstile({}))

    await waitFor(() => {
      expect(result.current.alwaysApprove).toBe(true)
    })
    expect(result.current.token).toBe(TURNSTILE_ALWAYS_APPROVE_TOKEN)
    result.current.reset()
    expect(result.current.token).toBe(TURNSTILE_ALWAYS_APPROVE_TOKEN)
  })
})
