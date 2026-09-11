import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ListResponse } from '@/types/api-responses'
import type { Passkey } from '@/types/user'
import { PasskeyManager } from '../passkey-manager'

const { mockGetPasskeys } = vi.hoisted(() => ({
  mockGetPasskeys: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@simplewebauthn/browser'), () => ({
  startRegistration: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('@/lib/api/client'), () => ({
  deletePasskey: vi.fn<VitestLooseMock>(),
  getPasskeyRegistrationOptions: vi.fn<VitestLooseMock>(),
  getPasskeysClient: mockGetPasskeys,
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

const mfaStatus = {
  passkeys_count: 2,
  totp_count: 2,
  mfa_required: false,
  has_mfa: true,
  has_password: false,
  recovery_codes_remaining: 0,
}

function makePasskey(id: string, name = id): Passkey {
  return {
    id,
    name,
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

describe('PasskeyManager — pagination', () => {
  beforeEach(() => {
    mockGetPasskeys.mockReset()
  })

  it('renders no rows and no continuation control for an empty first page', () => {
    render(
      <PasskeyManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )

    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('does not render a continuation control when the first page has no next page', () => {
    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1')])}
        mfaStatus={mfaStatus}
      />,
    )

    expect(screen.getByText('pk-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('loads, appends, and deduplicates the next page via the cursor endpoint', async () => {
    mockGetPasskeys.mockResolvedValueOnce(
      page([makePasskey('pk-2'), makePasskey('pk-3')], {
        has_next_page: false,
        end_cursor: null,
      }),
    )

    render(
      <PasskeyManager
        initialData={page([makePasskey('pk-1'), makePasskey('pk-2')], {
          has_next_page: true,
          end_cursor: 'pk-cursor',
        })}
        mfaStatus={mfaStatus}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(mockGetPasskeys).toHaveBeenCalledWith({ after: 'pk-cursor' })
    })
    await waitFor(() => {
      expect(screen.getByText('pk-3')).toBeInTheDocument()
    })
    expect(screen.getByText('pk-1')).toBeInTheDocument()
    // pk-2 appears on both pages but should only render once
    expect(screen.getAllByRole('button', { name: /^Remove$/ })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })
})
