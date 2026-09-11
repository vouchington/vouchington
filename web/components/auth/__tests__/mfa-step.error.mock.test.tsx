import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(import('@simplewebauthn/browser'), () => ({
  startAuthentication: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  getMfaPasskeyOptions: vi.fn<VitestLooseMock>(),
  verifyMfaPasskey: vi.fn<VitestLooseMock>(),
  verifyMfaTotp: vi.fn<VitestLooseMock>(),
}))

const { toastMock } = vi.hoisted(() => {
  const mock = Object.assign(vi.fn<VitestLooseMock>(), {
    error: vi.fn<VitestLooseMock>(),
    success: vi.fn<VitestLooseMock>(),
  })
  return { toastMock: mock }
})

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: toastMock,
    }) as unknown as typeof import('sonner'),
)

vi.mock(import('@/lib/on-error'), () => ({
  default: (err: unknown, options: { fallback: string }) => {
    toastMock.error(options.fallback)
    return options.fallback
  },
  onSuccess: (message: string) => {
    toastMock.success(message)
  },
}))

import MfaStep from '../mfa-step'
import { getMfaPasskeyOptions, verifyMfaPasskey, verifyMfaTotp } from '@/lib/api/client'
import { ApiError } from '@/lib/api/error'
import { startAuthentication } from '@simplewebauthn/browser'

const mockGetOptions = vi.mocked(getMfaPasskeyOptions)
const mockVerifyPasskey = vi.mocked(verifyMfaPasskey)
const mockVerifyTotp = vi.mocked(verifyMfaTotp)
const mockStartAuth = vi.mocked(startAuthentication)

describe('MfaStep error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports TOTP submit failures via onError fallback', async () => {
    // Simulate verifyMfaTotp rejection on form submit path (L38-39 handleTotpSubmit).
    // First populate the OTP via onChange-autosubmit (L81-87), then assert toast.
    mockVerifyTotp.mockRejectedValueOnce(new Error('Bad code'))

    render(
      <MfaStep
        loginAttemptId='attempt-1'
        onSuccess={vi.fn<VitestLooseMock>()}
        onBack={vi.fn<VitestLooseMock>()}
      />,
    )
    // OTP input doesn't carry a label we can target; rely on the rendered input.
    const input = document.querySelector('input') as HTMLInputElement
    fireEvent.input(input, { target: { value: '123456' } })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Unable to verify. Please try again.')
    })
  })

  it('shows "Invalid verification code" for 401 ApiError on TOTP submit', async () => {
    mockVerifyTotp.mockRejectedValueOnce(new ApiError('Unauthorized', 401))

    render(
      <MfaStep
        loginAttemptId='attempt-1'
        onSuccess={vi.fn<VitestLooseMock>()}
        onBack={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = document.querySelector('input') as HTMLInputElement
    fireEvent.input(input, { target: { value: '654321' } })

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Invalid verification code')
    })
  })

  it('handles passkey NotAllowedError with skipSentry fallback', async () => {
    mockGetOptions.mockResolvedValueOnce({ options: {} } as never)
    const notAllowed = new Error('cancelled')
    notAllowed.name = 'NotAllowedError'
    mockStartAuth.mockRejectedValueOnce(notAllowed)

    render(
      <MfaStep
        loginAttemptId='attempt-1'
        onSuccess={vi.fn<VitestLooseMock>()}
        onBack={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /use a passkey/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Passkey verification was cancelled')
    })
  })

  it('reports generic passkey failures via onError fallback', async () => {
    mockGetOptions.mockResolvedValueOnce({ options: {} } as never)
    mockStartAuth.mockResolvedValueOnce({} as never)
    mockVerifyPasskey.mockRejectedValueOnce(new Error('Verify failed'))

    render(
      <MfaStep
        loginAttemptId='attempt-1'
        onSuccess={vi.fn<VitestLooseMock>()}
        onBack={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /use a passkey/i }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Unable to verify. Please try again.')
    })
  })

  it('emits onSuccess Verified on successful passkey auth', async () => {
    mockGetOptions.mockResolvedValueOnce({ options: {} } as never)
    mockStartAuth.mockResolvedValueOnce({} as never)
    mockVerifyPasskey.mockResolvedValueOnce({} as never)
    const onSuccess = vi.fn<VitestLooseMock>()

    render(
      <MfaStep
        loginAttemptId='attempt-1'
        onSuccess={onSuccess}
        onBack={vi.fn<VitestLooseMock>()}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /use a passkey/i }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Verified')
    })
    expect(onSuccess).toHaveBeenCalled()
  })

  it('reports TOTP form-submit failures via onError fallback', async () => {
    // Auto-submit (L82) resolves successfully, then explicit form submit (L38-39)
    // rejects so the handleTotpSubmit catch path is exercised.
    mockVerifyTotp
      .mockResolvedValueOnce({ user: { id: 'u-1' } } as never)
      .mockRejectedValueOnce(new Error('Bad code'))

    render(
      <MfaStep
        loginAttemptId='attempt-1'
        onSuccess={vi.fn<VitestLooseMock>()}
        onBack={vi.fn<VitestLooseMock>()}
      />,
    )
    const input = document.querySelector('input') as HTMLInputElement
    fireEvent.input(input, { target: { value: '123456' } })

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Verified')
    })

    const form = input.closest('form') as HTMLFormElement
    fireEvent.submit(form)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Unable to verify. Please try again.')
    })
  })
})
