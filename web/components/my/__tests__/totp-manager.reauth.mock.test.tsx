import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  MfaReauthDialogMock,
  mfaReauthOnErrorModule,
  mfaReauthStatus as mfaStatus,
} from '@/test-helpers/components/my/mfa-reauth-dialog.mock-support'

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
      MfaReauthDialog: MfaReauthDialogMock,
    }) as unknown as typeof import('@/components/my/mfa-reauth-dialog'),
)

vi.mock(import('@/lib/api/error'), () => ({
  ApiError,
}))

vi.mock(import('@/lib/on-error'), () => mfaReauthOnErrorModule())

import { deleteTotpAuthenticator } from '@/lib/api/client'
import type { ListResponse } from '@/types/api-responses'
import type { TotpAuthenticator } from '@/types/user'
import { TotpManager } from '../totp-manager'

const mockDelete = vi.mocked(deleteTotpAuthenticator)

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

  it('requires a proof before removing a factor even when other factors remain', async () => {
    render(
      <TotpManager
        initialData={page([makeAuth('totp-1'), makeAuth('totp-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getAllByRole('button', { name: /^Remove$/ })[0]!)
    fireEvent.click(await screen.findByRole('button', { name: /confirm remove|confirm/i }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'true')
    expect(mockDelete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verify MFA' }))
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('totp-1', 'reauth-token'))
    expect(mockDelete).toHaveBeenCalledOnce()
  })

  it('leaves the factor intact when fresh authentication is cancelled', async () => {
    render(
      <TotpManager
        initialData={page([makeAuth('totp-1')])}
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
