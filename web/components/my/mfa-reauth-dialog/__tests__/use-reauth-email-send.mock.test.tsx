import { act, renderHook } from '@testing-library/react'
import { ApiError } from '@vouchington/api-client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useReAuthEmailSend } from '../use-reauth-email-send'

const mockRequestReAuthEmail = vi.hoisted(() => vi.fn<VitestLooseMock>())

vi.mock(import('@/lib/api/client'), () => ({
  requestReAuthEmail: mockRequestReAuthEmail,
}))

function renderSend() {
  const onSent = vi.fn<(emailAddress: string) => void>()
  const setLoading = vi.fn<(loading: boolean) => void>()
  const hook = renderHook(() => useReAuthEmailSend({ onSent, setLoading }))
  return { ...hook, onSent, setLoading }
}

describe('useReAuthEmailSend', () => {
  beforeEach(() => {
    mockRequestReAuthEmail.mockReset()
  })

  it('sends once when called twice in the same tick', async () => {
    mockRequestReAuthEmail.mockResolvedValue({
      email_address: 'a@b.test',
      resend_after_seconds: 60,
    })
    const { result, onSent } = renderSend()
    await act(async () => {
      await Promise.all([result.current.sendEmail(), result.current.sendEmail()])
    })
    expect(mockRequestReAuthEmail).toHaveBeenCalledTimes(1)
    expect(onSent).toHaveBeenCalledWith('a@b.test')
  })

  it('disables resend for the server interval after a send', async () => {
    mockRequestReAuthEmail.mockResolvedValue({
      email_address: 'a@b.test',
      resend_after_seconds: 60,
    })
    const { result } = renderSend()
    await act(() => result.current.sendEmail())
    expect(result.current.resendSecondsLeft).toBe(60)
    await act(() => result.current.sendEmail())
    expect(mockRequestReAuthEmail).toHaveBeenCalledTimes(1)
  })

  it('starts the countdown from retry_after on a 429 and keeps the pane state', async () => {
    mockRequestReAuthEmail.mockRejectedValue(
      new ApiError('Too Many Requests', 429, { retry_after: 23 }),
    )
    const { result, onSent } = renderSend()
    await act(() => result.current.sendEmail())
    expect(result.current.resendSecondsLeft).toBe(23)
    expect(onSent).not.toHaveBeenCalled()
  })
})
