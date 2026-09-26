import { beforeEach, describe, it, vi } from 'vitest'
import { render } from '@testing-library/react'

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
  default: (_err: unknown, options: { fallback: string }) => {
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
import {
  clickSubmit,
  confirmRemove,
  expectToast,
  expectToastAbsent,
  mfaManagerStatus,
  mfaReauthRequiredError,
  renameAndSave,
} from '@/test-helpers/components/my/mfa-manager-error-cases'

const mockGetOptions = vi.mocked(getPasskeyRegistrationOptions)
const mockVerify = vi.mocked(verifyPasskeyRegistration)
const mockStartRegistration = vi.mocked(startRegistration)
const mockRename = vi.mocked(renamePasskey)
const mockDelete = vi.mocked(deletePasskey)

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

const assertions = {
  expect: (run: () => void | Promise<void>) => run(),
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
        mfaStatus={mfaManagerStatus}
      />,
    )
    clickSubmit(/add passkey/i)
    await assertions.expect(() =>
      expectToast(toastMock, 'error', 'Passkey registration was cancelled'),
    )
  })

  it('reports add-passkey failures via generic onError fallback', async () => {
    mockVerify.mockRejectedValueOnce(new Error('Verify failed'))
    render(
      <PasskeyManager
        initialData={page([])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    clickSubmit(/add passkey/i)
    await assertions.expect(() => expectToast(toastMock, 'error', 'Failed to add passkey'))
  })

  it('emits onSuccess on successful add', async () => {
    mockVerify.mockResolvedValueOnce({ passkey: makePasskey('pk-new') } as never)
    render(
      <PasskeyManager
        initialData={page([])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    clickSubmit(/add passkey/i)
    await assertions.expect(() => expectToast(toastMock, 'success', 'Passkey added successfully'))
  })

  it('reports rename failures via onError fallback', async () => {
    mockRename.mockRejectedValueOnce(new Error('Rename failed'))
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    renameAndSave(/rename passkey/i, 'Updated')
    await assertions.expect(() => expectToast(toastMock, 'error', 'Failed to rename passkey'))
  })

  it('reports remove failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    await confirmRemove()
    await assertions.expect(() => expectToast(toastMock, 'error', 'Failed to remove passkey'))
  })

  it('emits onSuccess on successful rename', async () => {
    mockRename.mockResolvedValueOnce({} as never)
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    renameAndSave(/rename passkey/i, 'Updated')
    await assertions.expect(() => expectToast(toastMock, 'success', 'Passkey renamed'))
  })

  it('emits onSuccess on successful remove', async () => {
    mockDelete.mockResolvedValueOnce(undefined as never)
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    await confirmRemove()
    await assertions.expect(() => expectToast(toastMock, 'success', 'Passkey removed'))
  })

  it('opens reauth dialog when remove returns MFA_REAUTH_REQUIRED', async () => {
    mockDelete.mockRejectedValueOnce(await mfaReauthRequiredError())
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    await confirmRemove()
    await assertions.expect(() => expectToastAbsent(toastMock, 'error', 'Failed to remove passkey'))
  })
})
