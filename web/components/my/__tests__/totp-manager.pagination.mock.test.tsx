import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import type { ListResponse } from '@/types/api-responses'
import type { TotpAuthenticator } from '@/types/user'
import { TotpManager } from '../totp-manager'
import { setupTotp, verifyTotpSetup } from '@/lib/api/client'

const { mockGetAuthenticators } = vi.hoisted(() => ({
  mockGetAuthenticators: vi.fn<VitestLooseMock>(),
}))

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
  getTotpAuthenticatorsClient: mockGetAuthenticators,
}))

vi.mock(
  import('@/components/my/mfa-reauth-dialog'),
  () =>
    ({
      MfaReauthDialog: ({ open }: { open: boolean }) => (
        <div
          data-testid='mfa-reauth-dialog'
          data-open={String(open)}
        />
      ),
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

function makeAuth(id: string, name = id): TotpAuthenticator {
  return {
    id,
    name,
    created_at: new Date().toISOString(),
  } as TotpAuthenticator
}

function page(
  results: TotpAuthenticator[],
  pageInfo: Partial<ListResponse<TotpAuthenticator>['page_info']> = {},
): ListResponse<TotpAuthenticator> {
  return {
    results,
    page_info: { has_next_page: false, end_cursor: null, start_cursor: null, ...pageInfo },
  }
}

const mockSetupTotp = vi.mocked(setupTotp)
const mockVerifyTotpSetup = vi.mocked(verifyTotpSetup)

describe('TotpManager — pagination', () => {
  beforeEach(() => {
    mockGetAuthenticators.mockReset()
    mockSetupTotp.mockReset()
    mockVerifyTotpSetup.mockReset()
  })

  it('renders no rows and no continuation control for an empty first page', () => {
    render(
      <TotpManager
        initialData={page([])}
        mfaStatus={mfaStatus}
      />,
    )

    expect(screen.queryByRole('button', { name: /^Remove$/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('does not render a continuation control when the first page has no next page', () => {
    render(
      <TotpManager
        initialData={page([makeAuth('totp-1')])}
        mfaStatus={mfaStatus}
      />,
    )

    expect(screen.getByText('totp-1')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('loads, appends, and deduplicates the next page via the cursor endpoint', async () => {
    mockGetAuthenticators.mockResolvedValueOnce(
      page([makeAuth('totp-2'), makeAuth('totp-3')], {
        has_next_page: false,
        end_cursor: null,
      }),
    )

    render(
      <TotpManager
        initialData={page([makeAuth('totp-1'), makeAuth('totp-2')], {
          has_next_page: true,
          end_cursor: 'totp-cursor',
        })}
        mfaStatus={mfaStatus}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => {
      expect(mockGetAuthenticators).toHaveBeenCalledWith({ after: 'totp-cursor' })
    })
    await waitFor(() => {
      expect(screen.getByText('totp-3')).toBeInTheDocument()
    })
    expect(screen.getByText('totp-1')).toBeInTheDocument()
    // totp-2 appears on both pages but should only render once
    expect(screen.getAllByRole('button', { name: /^Remove$/ })).toHaveLength(3)
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('does not treat an unloaded later page as the last MFA method', () => {
    // Only one authenticator has been loaded so far (a second page exists but hasn't
    // been fetched), while mfaStatus reports the server's authoritative total of 2.
    // The "last MFA method" guard must read mfaStatus, not the accumulated-pages
    // array length, or it would wrongly force the reauth flow here.
    render(
      <TotpManager
        initialData={page([makeAuth('totp-1')], {
          has_next_page: true,
          end_cursor: 'totp-cursor',
        })}
        mfaStatus={{ ...mfaStatus, passkeys_count: 0, totp_count: 2 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))
    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')
    expect(screen.getByRole('button', { name: /confirm remove|confirm/i })).toBeInTheDocument()
  })

  it('counts a locally added authenticator toward the last MFA method check', async () => {
    // Mirrors playwright/tests/my/totp.spec.mts: a user with 1 existing passkey adds a
    // TOTP authenticator via the real setup flow in this session. mfaStatus is a static
    // snapshot fetched once at page load, so mfaStatus.totp_count is still 0 right after
    // — the guard must add the locally-created authenticator on top of that snapshot, or
    // it will wrongly treat the new authenticator as the last MFA method and skip the
    // confirm button, jumping straight to the reauth dialog.
    mockSetupTotp.mockResolvedValueOnce({
      authenticator: makeAuth('totp-new'),
      secret: 'ABCDEF',
      uri: 'otpauth://totp/test',
    } as never)
    mockVerifyTotpSetup.mockResolvedValueOnce({
      authenticator: makeAuth('totp-new'),
    } as never)

    render(
      <TotpManager
        initialData={page([])}
        mfaStatus={{ ...mfaStatus, passkeys_count: 1, totp_count: 0 }}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /add authenticator/i }))
    const startButtons = screen.getAllByRole('button')
    const startBtn = startButtons.find(btn => btn.getAttribute('type') === 'submit')
    fireEvent.click(startBtn!)

    await screen.findByText(/Enter the 6-digit code/i)
    const otpInput =
      (document.querySelector('input[autocomplete="one-time-code"]') as HTMLInputElement | null) ??
      (document.querySelector('input') as HTMLInputElement)
    fireEvent.input(otpInput, { target: { value: '123456' } })

    await screen.findByRole('button', { name: /^Remove$/ })
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/ }))

    expect(screen.getByTestId('mfa-reauth-dialog')).toHaveAttribute('data-open', 'false')
    expect(screen.getByRole('button', { name: /confirm remove|confirm/i })).toBeInTheDocument()
  })
})
