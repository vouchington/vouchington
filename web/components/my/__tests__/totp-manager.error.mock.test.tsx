import { beforeEach, describe, it, vi } from 'vitest'
import { render } from '@testing-library/react'

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
  default: (_err: unknown, options: { fallback: string }) => {
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
import {
  clickSubmit,
  confirmRemove,
  enterOtp,
  expectToast,
  expectToastAbsent,
  mfaManagerStatus,
  mfaReauthRequiredError,
  renameAndSave,
} from '@/test-helpers/components/my/mfa-manager-error-cases'

const mockSetupTotp = vi.mocked(setupTotp)
const mockVerifyTotpSetup = vi.mocked(verifyTotpSetup)
const mockRename = vi.mocked(renameTotpAuthenticator)
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

const assertions = {
  expect: (run: () => void | Promise<void>) => run(),
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
        mfaStatus={mfaManagerStatus}
      />,
    )
    clickSubmit(/add authenticator/i)
    await assertions.expect(() => expectToast(toastMock, 'error', 'Failed to start setup'))
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
        mfaStatus={mfaManagerStatus}
      />,
    )
    clickSubmit(/add authenticator/i)
    await enterOtp('123456')
    await assertions.expect(() => expectToast(toastMock, 'error', 'Failed to verify code'))
  })

  it('reports rename failures via onError fallback', async () => {
    mockRename.mockRejectedValueOnce(new Error('Rename failed'))
    render(
      <TotpManager
        initialData={page([makeAuth('a-1')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    renameAndSave(/rename authenticator/i, 'Updated')
    await assertions.expect(() => expectToast(toastMock, 'error', 'Failed to rename authenticator'))
  })

  it('reports remove failures via onError fallback', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Delete failed'))
    render(
      <TotpManager
        initialData={page([makeAuth('a-1'), makeAuth('a-2')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    await confirmRemove()
    await assertions.expect(() => expectToast(toastMock, 'error', 'Failed to remove authenticator'))
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
        mfaStatus={mfaManagerStatus}
      />,
    )
    clickSubmit(/add authenticator/i)
    await enterOtp('123456')
    await assertions.expect(() =>
      expectToast(toastMock, 'success', 'Authenticator added successfully'),
    )
  })

  it('emits onSuccess on successful rename', async () => {
    mockRename.mockResolvedValueOnce(undefined as never)
    render(
      <TotpManager
        initialData={page([makeAuth('a-1')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    renameAndSave(/rename authenticator/i, 'Updated')
    await assertions.expect(() => expectToast(toastMock, 'success', 'Authenticator renamed'))
  })

  it('emits onSuccess on successful remove', async () => {
    mockDelete.mockResolvedValueOnce(undefined as never)
    render(
      <TotpManager
        initialData={page([makeAuth('a-1'), makeAuth('a-2')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    await confirmRemove()
    await assertions.expect(() => expectToast(toastMock, 'success', 'Authenticator removed'))
  })

  it('opens reauth dialog when remove returns MFA_REAUTH_REQUIRED', async () => {
    mockDelete.mockRejectedValueOnce(await mfaReauthRequiredError())
    render(
      <TotpManager
        initialData={page([makeAuth('a-1'), makeAuth('a-2')])}
        mfaStatus={mfaManagerStatus}
      />,
    )
    await confirmRemove()
    await assertions.expect(() =>
      expectToastAbsent(toastMock, 'error', 'Failed to remove authenticator'),
    )
  })
})
