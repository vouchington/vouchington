import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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

import { PasskeyManager } from '../passkey-manager'
import {
  deletePasskey,
  getPasskeyRegistrationOptions,
  renamePasskey,
  verifyPasskeyRegistration,
} from '@/lib/api/client'
import { startRegistration } from '@simplewebauthn/browser'
import type { ListResponse } from '@/types/api-responses'
import type { Passkey } from '@/types/user'

const mockGetOptions = vi.mocked(getPasskeyRegistrationOptions)
const mockVerify = vi.mocked(verifyPasskeyRegistration)
const mockStartRegistration = vi.mocked(startRegistration)
const mockRename = vi.mocked(renamePasskey)
const mockDelete = vi.mocked(deletePasskey)

const mfaStatus = {
  passkeys_count: 2,
  totp_count: 2,
  mfa_required: false,
  has_mfa: true,
  has_password: false,
  recovery_codes_remaining: 0,
}

function makePasskey(id: string, name = 'My Key'): Passkey {
  return {
    id,
    name,
    device_type: 'multiDevice',
    backed_up: true,
    created_at: new Date().toISOString(),
    last_used_at: null,
  } as Passkey
}

function page(results: Passkey[]): ListResponse<Passkey> {
  return { results, page_info: { has_next_page: false, end_cursor: null, start_cursor: null } }
}

describe('PasskeyManager error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDelete.mockReset()
    mockDelete.mockResolvedValue(undefined as never)
    mockGetOptions.mockResolvedValue({
      options: { challenge: 'c', rp: { id: 'localhost', name: 'app' }, user: {} },
    } as never)
    mockStartRegistration.mockResolvedValue({} as never)
  })

  it('handles NotAllowedError with skipSentry cancellation fallback', async () => {
    const notAllowed = new Error('cancelled')
    notAllowed.name = 'NotAllowedError'
    mockStartRegistration.mockRejectedValueOnce(notAllowed)

    render(
      <PasskeyManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }))
    const sendButtons = screen.getAllByRole('button')
    const sendBtn = sendButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(sendBtn!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Passkey registration was cancelled')
    })
  })

  it('reports add-passkey failures via generic onError fallback', async () => {
    mockVerify.mockRejectedValueOnce(new Error('Verify failed'))

    render(
      <PasskeyManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }))
    const sendButtons = screen.getAllByRole('button')
    const sendBtn = sendButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(sendBtn!)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to add passkey')
    })
  })

  it('emits onSuccess on successful add', async () => {
    mockVerify.mockResolvedValueOnce({ passkey: makePasskey('pk-new') } as never)

    render(
      <PasskeyManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /add passkey/i }))
    const sendButtons = screen.getAllByRole('button')
    const sendBtn = sendButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(sendBtn!)

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Passkey added successfully')
    })
  })

  it('reports rename failures via onError fallback', async () => {
    mockRename.mockRejectedValueOnce(new Error('Rename failed'))

    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Rename$/ }))
    const renameInput = screen.getByLabelText(/rename passkey/i) as HTMLInputElement
    fireEvent.change(renameInput, { target: { value: 'Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to rename passkey')
    })
  })

  it('reports remove failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))

    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    // Click Remove on first passkey to enter confirm mode, then confirm.
    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ })
    fireEvent.click(removeButtons[0]!)
    const confirmButton = await screen.findByRole('button', { name: /confirm remove|confirm/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(toastMock.error).toHaveBeenCalledWith('Failed to remove passkey')
    })
  })

  it('emits onSuccess on successful rename', async () => {
    mockRename.mockResolvedValueOnce({} as never)

    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')])}
        mfaStatus={mfaStatus}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Rename$/ }))
    const renameInput = screen.getByLabelText(/rename passkey/i) as HTMLInputElement
    fireEvent.change(renameInput, { target: { value: 'Updated' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Passkey renamed')
    })
  })

  it('emits onSuccess on successful remove', async () => {
    mockDelete.mockResolvedValueOnce(undefined as never)

    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ })
    fireEvent.click(removeButtons[0]!)
    const confirmButton = await screen.findByRole('button', { name: /confirm remove|confirm/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      expect(toastMock.success).toHaveBeenCalledWith('Passkey removed')
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
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
        mfaStatus={mfaStatus}
      />,
    )
    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ })
    fireEvent.click(removeButtons[0]!)
    const confirmButton = await screen.findByRole('button', { name: /confirm remove|confirm/i })
    fireEvent.click(confirmButton)

    await waitFor(() => {
      // Generic error fallback should NOT have been called for this code path.
      expect(toastMock.error).not.toHaveBeenCalledWith('Failed to remove passkey')
    })
  })
})
