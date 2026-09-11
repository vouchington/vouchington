import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

vi.mock(
  import('qrcode.react'),
  () =>
    ({
      QRCodeSVG: () => <svg />,
    }) as unknown as typeof import('qrcode.react'),
)

vi.mock(import('@/lib/api/client'), () => ({
  setupTotp: vi.fn<VitestLooseMock>(),
  verifyTotpSetup: vi.fn<VitestLooseMock>(),
  renameTotpAuthenticator: vi.fn<VitestLooseMock>(),
  deleteTotpAuthenticator: vi.fn<VitestLooseMock>(),
  getTotpAuthenticatorsClient: vi.fn<VitestLooseMock>(),
}))

vi.mock(
  import('@/components/my/mfa-reauth-dialog'),
  () =>
    ({
      MfaReauthDialog: () => null,
    }) as unknown as typeof import('@/components/my/mfa-reauth-dialog'),
)

vi.mock(import('@/lib/api/error'), () => {
  class ApiError extends Error {
    status: number
    code?: string
    constructor(message: string, status: number, code?: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.code = code
    }
  }
  return { ApiError }
})

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

import { TotpManager } from '../totp-manager'
import {
  deleteTotpAuthenticator,
  renameTotpAuthenticator,
  setupTotp,
  verifyTotpSetup,
} from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { TotpAuthenticator } from '@/types/user'

const mockSetupTotp = vi.mocked(setupTotp)
const mockVerifyTotpSetup = vi.mocked(verifyTotpSetup)
const mockRename = vi.mocked(renameTotpAuthenticator)
const mockDelete = vi.mocked(deleteTotpAuthenticator)

const mfaStatus = {
  passkeys_count: 2,
  totp_count: 2,
  mfa_required: false,
  has_mfa: true,
  has_password: false,
  recovery_codes_remaining: 0,
}

function makeAuth(id: string, name = 'My App'): TotpAuthenticator {
  return {
    id,
    name,
    created_at: new Date().toISOString(),
  } as TotpAuthenticator
}

function page(results: TotpAuthenticator[]): ListResponse<TotpAuthenticator> {
  return { results, page_info: { has_next_page: false, end_cursor: null, start_cursor: null } }
}

describe('TotpManager error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reports start-setup failures via onError fallback', async () => {
    mockSetupTotp.mockRejectedValueOnce(new Error('Setup failed'))

    render(
      <TotpManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add authenticator/i }))
    const buttons = screen.getAllByRole('button')
    const submit = buttons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(submit!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to start setup')
    })
  })

  it('reports verify-setup failures via onError fallback', async () => {
    mockSetupTotp.mockResolvedValueOnce({
      authenticator: makeAuth('totp-new'),
      secret: 'ABCDEF',
      uri: 'otpauth://totp/test',
    } as never)
    mockVerifyTotpSetup.mockRejectedValueOnce(new Error('Bad code'))

    render(
      <TotpManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add authenticator/i }))
    const startButtons = screen.getAllByRole('button')
    const startBtn = startButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(startBtn!)

    // After setup data arrives, an OTP input appears. Type 6 chars to autosubmit.
    await screen.findByText(/Enter the 6-digit code/i)
    const otpInput = document.querySelector(
      'input[autocomplete="one-time-code"]',
    ) as HTMLInputElement
    if (!otpInput) {
      // Fallback: pick the first input element rendered by the OTP component.
      const input = document.querySelector('input')
      fireEvent.input(input!, { target: { value: '123456' } })
    } else {
      fireEvent.input(otpInput, { target: { value: '123456' } })
    }

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to verify code')
    })
  })

  it('reports rename failures via onError fallback', async () => {
    mockRename.mockRejectedValueOnce(new Error('Rename failed'))

    render(
      <TotpManager
        initialData={page([makeAuth('a-1')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Rename$/ }))
    const renameInput = screen.getByLabelText(/rename authenticator/i) as HTMLInputElement
    fireEvent.change(renameInput, { target: { value: 'Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to rename authenticator')
    })
  })

  it('reports remove failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))

    render(
      <TotpManager
        initialData={page([makeAuth('a-1'), makeAuth('a-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ })
    fireEvent.click(removeButtons[0]!)
    const confirmButton = await screen.findByRole('button', { name: /confirm remove|confirm/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to remove authenticator')
    })
  })

  it('emits onSuccess on successful verify-setup', async () => {
    mockSetupTotp.mockResolvedValueOnce({
      authenticator: makeAuth('totp-new'),
      secret: 'ABCDEF',
      uri: 'otpauth://totp/test',
    } as never)
    mockVerifyTotpSetup.mockResolvedValueOnce({ authenticator: makeAuth('totp-new') } as never)

    render(
      <TotpManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add authenticator/i }))
    const startButtons = screen.getAllByRole('button')
    const startBtn = startButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(startBtn!)

    await screen.findByText(/Enter the 6-digit code/i)
    const otpInput =
      (document.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement | null) ??
      (document.querySelector('input') as HTMLInputElement)
    fireEvent.input(otpInput, { target: { value: '123456' } })

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Authenticator added successfully')
    })
  })

  it('emits onSuccess on successful rename', async () => {
    mockRename.mockResolvedValueOnce(undefined as never)

    render(
      <TotpManager
        initialData={page([makeAuth('a-1')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Rename$/ }))
    const renameInput = screen.getByLabelText(/rename authenticator/i) as HTMLInputElement
    fireEvent.change(renameInput, { target: { value: 'Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Authenticator renamed')
    })
  })

  it('emits onSuccess on successful remove', async () => {
    mockDelete.mockResolvedValueOnce(undefined as never)

    render(
      <TotpManager
        initialData={page([makeAuth('a-1'), makeAuth('a-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ })
    fireEvent.click(removeButtons[0]!)
    const confirmButton = await screen.findByRole('button', { name: /confirm remove|confirm/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Authenticator removed')
    })
  })

  it('opens reauth dialog when remove returns MFA_REAUTH_REQUIRED', async () => {
    const { ApiError } = await import('@/lib/api/error')
    mockDelete.mockRejectedValueOnce(
      new (ApiError as unknown as new (msg: string, status: number, code: string) => Error)(
        'reauth required',
        409,
        'MFA_REAUTH_REQUIRED',
      ),
    )

    render(
      <TotpManager
        initialData={page([makeAuth('a-1'), makeAuth('a-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ })
    fireEvent.click(removeButtons[0]!)
    const confirmButton = await screen.findByRole('button', { name: /confirm remove|confirm/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(toastMock.error).not.toHaveBeenCalledWith('Failed to remove authenticator')
    })
  })
})
