import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { expectInputEnterSubmits } from '@/test-helpers/form-keyboard'
import type { ListResponse } from '@/types/api-responses'
import type { Passkey } from '@/types/user'
import { PasskeyManager } from '../passkey-manager'

const emptyPasskeys: ListResponse<Passkey> = {
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
      MfaReauthDialog: () => null,
    }) as unknown as typeof import('@/components/my/mfa-reauth-dialog'),
)

import { getPasskeyRegistrationOptions, verifyPasskeyRegistration } from '@/lib/api/client'
import { startRegistration } from '@simplewebauthn/browser'

const mockGetOptions = vi.mocked(getPasskeyRegistrationOptions)
const mockVerify = vi.mocked(verifyPasskeyRegistration)
const mockStartRegistration = vi.mocked(startRegistration)

const mfaStatus = {
  passkeys_count: 0,
  totp_count: 0,
  mfa_required: false,
  has_mfa: false,
  has_password: false,
  recovery_codes_remaining: 0,
}

describe('PasskeyManager keyboard submit (create form)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockGetOptions.mockResolvedValue({
      options: { challenge: 'c', rp: { id: 'localhost', name: 'app' }, user: {} },
    } as never)
    mockStartRegistration.mockResolvedValue({} as never)
    mockVerify.mockResolvedValue({
      passkey: {
        id: 'pk-1',
        name: 'Test',
        device_type: 'multiDevice',
        backed_up: true,
        created_at: new Date().toISOString(),
        last_used_at: null,
      },
    } as never)
  })

  it('Enter on the passkey-name input triggers the registration flow', async () => {
    render(
      <PasskeyManager
        initialData={emptyPasskeys}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }))
    const input = screen.getByLabelText(/passkey name/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'My Laptop' } })
    void expectInputEnterSubmits({ input, onSubmit: mockGetOptions })
    await waitFor(() => {
      expect(mockGetOptions).toHaveBeenCalled()
    })
  })
})
