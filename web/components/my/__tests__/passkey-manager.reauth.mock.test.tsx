import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock(import('@simplewebauthn/browser'), () => ({
  startRegistration: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  deletePasskey: vi.fn<VitestLooseMock>(),
  getPasskeyRegistrationOptions: vi.fn<VitestLooseMock>(),
  getPasskeysClient: vi.fn<VitestLooseMock>(),
  renamePasskey: vi.fn<VitestLooseMock>(),
  verifyPasskeyRegistration: vi.fn<VitestLooseMock>(),
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

import { startRegistration } from '@simplewebauthn/browser'
import {
  deletePasskey,
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
} from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { Passkey } from '@/types/user'
import { PasskeyManager } from '../passkey-manager'

const mockDelete = vi.mocked(deletePasskey)
const mockStartRegistration = vi.mocked(startRegistration)
const mockGetRegistrationOptions = vi.mocked(getPasskeyRegistrationOptions)
const mockVerifyRegistration = vi.mocked(verifyPasskeyRegistration)

const mfaStatus = {
  passkeys_count: 2,
  totp_count: 2,
  mfa_required: false,
  has_mfa: true,
  has_password: false,
  recovery_codes_remaining: 0,
}

function makePasskey(id: string): Passkey {
  return {
    id,
    name: id,
    device_type: 'multiDevice',
    backed_up: true,
    created_at: new Date().toISOString(),
    last_used_at: null,
  } as Passkey
}

function page(
  results: Passkey[],
  pageInfo: Partial<ListResponse<Passkey>['page_info']> = {},
): ListResponse<Passkey> {
  return {
    results,
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null, ...pageInfo },
  }
}

describe('PasskeyManager reauthentication', () => {
  beforeEach(() => {
    mockDelete.mockReset()
    mockDelete.mockResolvedValue(undefined as never)
    mockStartRegistration.mockReset()
    mockGetRegistrationOptions.mockReset()
    mockVerifyRegistration.mockReset()
  })

  it('allows only one token-bearing delete while the last-MFA deletion is pending', async () => {
    let resolveDelete!: () => void
    const pendingDelete = new Promise<void>(resolve => {
      resolveDelete = resolve
    })
    mockDelete.mockReturnValueOnce(pendingDelete as never)
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-last')])}
        mfaStatus={{ ...mfaStatus, passkeys_count: 1, totp_count: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('pk-last', 'reauth-token')
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
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
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
      expect(mockDelete).toHaveBeenNthCalledWith(1, 'pk-1', undefined)
      expect(mockDelete).toHaveBeenNthCalledWith(2, 'pk-1', 'reauth-token')
    })
  })

  it('reopens reauthentication when the token-bearing retry also requires MFA', async () => {
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
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
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
    expect(mockDelete).toHaveBeenNthCalledWith(1, 'pk-1', undefined)
    expect(mockDelete).toHaveBeenNthCalledWith(2, 'pk-1', 'reauth-token')
    expect(mockDelete).toHaveBeenNthCalledWith(3, 'pk-1', 'reauth-token')
  })

  it('does not treat an unloaded later page as the last MFA method', () => {
    // Only one passkey has been loaded so far (a second page exists but hasn't been
    // fetched), while mfaStatus reports the server's authoritative total of 2. The
    // "last MFA method" guard must read mfaStatus, not the accumulated-pages array
    // length, or it would wrongly force the reauth flow here.
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')], { has_next_page: true, end_cursor: 'cursor-1' })}
        mfaStatus={{ ...mfaStatus, passkeys_count: 2, totp_count: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')
    expect(screen.getByRole('button', { name: /confirm remove|confirm/i })).toBeInTheDocument()
  })

  it('counts a locally added passkey toward the last MFA method check', async () => {
    // Symmetric to the TOTP-side regression (playwright/tests/my/totp.spec.mts): a
    // user with 1 existing passkey and 0 TOTP authenticators adds a second passkey
    // through the real registration flow in this session. mfaStatus is a static
    // snapshot fetched once at page load, so mfaStatus.passkeys_count is still 1
    // right after — the guard must add the locally-created passkey on top of that
    // snapshot, or it will wrongly treat the new passkey as the last MFA method and
    // skip the confirm button, jumping straight to the reauth dialog.
    mockGetRegistrationOptions.mockResolvedValueOnce({
      options: { challenge: 'challenge' },
    } as never)
    mockStartRegistration.mockResolvedValueOnce({ id: 'cred-new' } as never)
    mockVerifyRegistration.mockResolvedValueOnce({ passkey: makePasskey('pk-new') } as never)

    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')])}
        mfaStatus={{ ...mfaStatus, passkeys_count: 1, totp_count: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }))
    fireEvent.click(screen.getByRole('button', { name: /create passkey/i }))

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Remove$/ })).toHaveLength(2)
    })

    fireEvent.click(screen.getAllByRole('button', { name: /^Remove$/ })[0]!)

    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')
    expect(screen.getByRole('button', { name: /confirm remove|confirm/i })).toBeInTheDocument()
  })

  it('clears the pending last-MFA deletion when reauthentication closes', () => {
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-last')])}
        mfaStatus={{ ...mfaStatus, passkeys_count: 1, totp_count: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Close MFA' }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')

    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    expect(mockDelete).not.toHaveBeenCalled()
  })
})
