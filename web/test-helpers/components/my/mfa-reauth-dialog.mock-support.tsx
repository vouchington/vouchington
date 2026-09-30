/* oxlint-disable no-mistakes/playwright-consistent-attribute -- reauth dialog test double keeps the static data-testid the manager reauth tests query */
import { vi } from 'vitest'

export function MfaReauthDialogMock({
  onClose,
  onVerified,
  open,
}: {
  onClose: () => void
  onVerified: (token: string) => Promise<void>
  open: boolean
}) {
  const verify = (
    // ast-grep-ignore: web-no-raw-form-elements -- reauth tests click this stand-in for the dialog verify action
    <button
      type='button'
      onClick={() => void onVerified('reauth-token')}
    >
      Verify MFA
    </button>
  )
  const close = (
    // ast-grep-ignore: web-no-raw-form-elements -- reauth tests click this stand-in for the dialog close action
    <button
      type='button'
      onClick={onClose}
    >
      Close MFA
    </button>
  )
  return (
    <div
      data-testid='mfa-reauth-dialog'
      data-open={String(open)}
    >
      {verify}
      {close}
    </div>
  )
}

// oxlint-disable-next-line react/only-export-components -- test double, never fast-refreshed
export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// oxlint-disable-next-line react/only-export-components -- test double, never fast-refreshed
export function mfaReauthOnErrorModule() {
  return {
    default: vi.fn<VitestLooseMock>(),
    onSuccess: vi.fn<VitestLooseMock>(),
  }
}

// oxlint-disable-next-line react/only-export-components -- test double, never fast-refreshed
export const mfaReauthStatus = {
  passkeys_count: 2,
  totp_count: 2,
  mfa_required: false,
  has_mfa: true,
  has_password: false,
  recovery_codes_remaining: 0,
}
