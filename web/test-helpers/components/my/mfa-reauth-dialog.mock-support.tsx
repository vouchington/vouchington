import { configure } from '@testing-library/react'
import { vi } from 'vitest'
import { Button } from '@/components/ui/button'

configure({ testIdAttribute: 'data-pw' })

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
    <Button
      type='button'
      onClick={() => void onVerified('reauth-token')}
    >
      Verify MFA
    </Button>
  )
  const close = (
    <Button
      type='button'
      onClick={onClose}
    >
      Close MFA
    </Button>
  )
  return (
    <div
      data-pw='mfa-reauth-dialog'
      data-open={String(open)}
    >
      {verify}
      {close}
    </div>
  )
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

// oxlint-disable-next-line react/only-export-components -- hook stand-in for tests outside the fresh-auth flow
export function useFreshAuthenticationMock() {
  return {
    requestAuthentication: async () => 'reauth-token',
    dialogProps: {
      open: false,
      mfaStatus: mfaReauthStatus,
      onClose: () => {},
      onVerified: (_token: string) => {},
    },
  }
}
