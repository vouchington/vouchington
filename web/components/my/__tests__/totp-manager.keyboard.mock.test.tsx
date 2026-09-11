import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import type { ListResponse } from '@/types/api-responses'
import type { TotpAuthenticator } from '@/types/user'
import { TotpManager } from '../totp-manager'

const emptyAuthenticators: ListResponse<TotpAuthenticator> = {
  results: [],
  page_info: { has_next_page: false, end_cursor: null, start_cursor: null },
}

vi.mock(
  import('sonner'),
  () =>
    ({
      toast: {
        success: vi.fn<VitestLooseMock>(),
        error: vi.fn<VitestLooseMock>(),
        info: vi.fn<VitestLooseMock>(),
      },
    }) as unknown as typeof import('sonner'),
)

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

import { setupTotp } from '@/lib/api/client'

const mockSetupTotp = vi.mocked(setupTotp)

const mfaStatus = {
  passkeys_count: 0,
  totp_count: 0,
  mfa_required: false,
  has_mfa: false,
  has_password: false,
  recovery_codes_remaining: 0,
}

describe('TotpManager keyboard submit (start-setup form)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockSetupTotp.mockResolvedValue({
      authenticator: {
        id: 'totp-1',
        name: 'Test',
        created_at: new Date().toISOString(),
      },
      secret: 'ABCDEF',
      uri: 'otpauth://totp/test',
    } as never)
  })

  it('Enter on the authenticator-name input triggers setupTotp', async () => {
    render(
      <TotpManager
        initialData={emptyAuthenticators}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add authenticator/i }))
    const input = screen.getByLabelText(/authenticator name/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'My Authenticator' } })
    void expectInputEnterSubmits({ input, onSubmit: mockSetupTotp })
    await waitFor(() => {
      expect(mockSetupTotp).toHaveBeenCalled()
    })
  })
})
