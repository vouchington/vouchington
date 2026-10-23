import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  MfaReauthDialogMock,
  mfaReauthOnErrorModule,
  mfaReauthStatus as mfaStatus,
} from '@/test-helpers/components/my/mfa-reauth-dialog.mock-support'

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
      MfaReauthDialog: MfaReauthDialogMock,
    }) as unknown as typeof import('@/components/my/mfa-reauth-dialog'),
)

vi.mock(import('@/lib/api/error'), () => ({
  ApiError,
}))

vi.mock(import('@/lib/on-error'), () => mfaReauthOnErrorModule())

import {
  deletePasskey,
  getPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
} from '@/lib/api/client'
import { startRegistration } from '@simplewebauthn/browser'
import type { ListResponse } from '@/types/api-responses'
import type { Passkey } from '@/types/user'
import { PasskeyManager } from '../passkey-manager'

const mockDelete = vi.mocked(deletePasskey)

function makePasskey(id: string): Passkey {
  return {
    id,
    name: id,
    device_type: 'multiDevice',
    is_backed_up: true,
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
  })

  it('requires a proof before removing a factor even when other factors remain', async () => {
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove$/ })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /confirm remove|confirm/i }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'true')
    expect(mockDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('pk-1', 'reauth-token'))
    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('requires fresh authentication before adding a passkey', async () => {
    vi.mocked(getPasskeyRegistrationOptions).mockResolvedValue({ options: {} })
    vi.mocked(startRegistration).mockResolvedValue(
      {} as Awaited<ReturnType<typeof startRegistration>>,
    )
    vi.mocked(verifyPasskeyRegistration).mockResolvedValue({ passkey: makePasskey('pk-new') })
    render(
      <PasskeyManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }))
    fireEvent.click(screen.getByRole('button', { name: /create passkey/i }))
    expect(getPasskeyRegistrationOptions).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    await screen.findByRole('button', { name: /^Remove$/ })
    expect(verifyPasskeyRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ re_auth_token: 'reauth-token' }),
    )
  })

  it('leaves the factor intact when fresh authentication is cancelled', async () => {
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
    fireEvent.click(await screen.findByRole('button', { name: /confirm remove|confirm/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Close MFA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    expect(mockDelete).not.toHaveBeenCalled()
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')
  })
})
