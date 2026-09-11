import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
      MfaReauthDialog: ({
        onClose,
        onVerified,
        open,
      }: {
        onClose: () => void
        onVerified: (token: string) => Promise<void>
        open: boolean
      }) => (
        <div
          data-testid='mfa-reauth-dialog'
          data-open={String(open)}
        >
          <button
            type='button'
            onClick={() => void onVerified('reauth-token')}
          >
            Verify MFA
          </button>
          <button
            type='button'
            onClick={onClose}
          >
            Close MFA
          </button>
        </div>
      ),
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

vi.mock(import('@/lib/on-error'), () => ({
  default: vi.fn<VitestLooseMock>(),
  onSuccess: vi.fn<VitestLooseMock>(),
}))

import { deleteTotpAuthenticator } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { TotpAuthenticator } from '@/types/user'
import { TotpManager } from '../totp-manager'

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

describe('TotpManager reauthentication', () => {
  beforeEach(() => {
    mockDelete.mockReset()
    mockDelete.mockResolvedValue(undefined as never)
  })

  it('allows only one token-bearing delete while the last-MFA deletion is pending', async () => {
    let resolveDelete!: () => void
    const pendingDelete = new Promise<void>(resolve => {
      resolveDelete = resolve
    })
    mockDelete.mockReturnValueOnce(pendingDelete as never)
    render(
      <TotpManager
        initialData={page([makeAuth('totp-last')])}
        mfaStatus={{ ...mfaStatus, passkeys_count: 0, totp_count: 1 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('totp-last', 'reauth-token')
    })
    expect(mockDelete).toHaveBeenCalledOnce()
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')

    resolveDelete()
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
    })
    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('retries an MFA_REAUTH_REQUIRED deletion with the pending ID and verified token', async () => {
    const { ApiError } = await import('@/lib/api/error')
    mockDelete
      .mockRejectedValueOnce(
        new (ApiError as unknown as new (msg: string, status: number, code: string) => Error)(
          'reauth required',
          409,
          'MFA_REAUTH_REQUIRED',
        ),
      )
      .mockResolvedValueOnce(undefined as never)

    render(
      <TotpManager
        initialData={page([makeAuth('totp-1'), makeAuth('totp-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove$/ })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /confirm remove|confirm/i }))
    await waitFor(() => {
      expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'true')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenNthCalledWith(1, 'totp-1', undefined)
      expect(mockDelete).toHaveBeenNthCalledWith(2, 'totp-1', 'reauth-token')
    })
  })

  it('reopens reauthentication when the token-bearing retry also requires MFA, and a further retry still works', async () => {
    // Regression test for the bug where handleRemoveWithReauth unconditionally
    // cleared the pending delete id after the await, wiping out the re-armed id
    // that handleRemove's catch block had just set for the second reauth attempt.
    // If that regresses, the third click below silently no-ops instead of calling
    // deleteTotpAuthenticator a third time.
    const { ApiError } = await import('@/lib/api/error')
    const reauthRequired = () =>
      new (ApiError as unknown as new (msg: string, status: number, code: string) => Error)(
        'reauth required',
        409,
        'MFA_REAUTH_REQUIRED',
      )
    mockDelete
      .mockRejectedValueOnce(reauthRequired())
      .mockRejectedValueOnce(reauthRequired())
      .mockResolvedValueOnce(undefined as never)

    render(
      <TotpManager
        initialData={page([makeAuth('totp-1'), makeAuth('totp-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove$/ })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /confirm remove|confirm/i }))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledOnce()
      expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'true')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledTimes(2)
      expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'true')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledTimes(3)
    })
    expect(mockDelete).toHaveBeenNthCalledWith(1, 'totp-1', undefined)
    expect(mockDelete).toHaveBeenNthCalledWith(2, 'totp-1', 'reauth-token')
    expect(mockDelete).toHaveBeenNthCalledWith(3, 'totp-1', 'reauth-token')
  })

  it('clears the pending last-MFA deletion when reauthentication closes', () => {
    render(
      <TotpManager
        initialData={page([makeAuth('totp-last')])}
        mfaStatus={{ ...mfaStatus, passkeys_count: 0, totp_count: 1 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close MFA' }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
