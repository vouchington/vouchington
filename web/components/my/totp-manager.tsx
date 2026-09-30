'use client'

import type { ListResponse } from '@/types/api-responses'
import type { MfaStatus, TotpAuthenticator } from '@/types/user'
import { MfaCredentialManagerShell } from './mfa-credential-manager-shell'
import { TotpManagerList } from './totp-manager/totp-manager-list'
import { TotpManagerSetup } from './totp-manager/totp-manager-setup'
import { useTotpManager } from './totp-manager/use-totp-manager'

interface Props {
  initialData: ListResponse<TotpAuthenticator>
  mfaStatus: MfaStatus
}

export function TotpManager({ initialData, mfaStatus }: Props) {
  const totp = useTotpManager(initialData, mfaStatus)

  return (
    <MfaCredentialManagerShell
      action={
        totp.step === 'list'
          ? { handleAdd: () => totp.setStep('setup'), kind: 'list' }
          : { kind: 'setup', panel: <TotpManagerSetup totp={totp} /> }
      }
      credential='totp'
      list={<TotpManagerList totp={totp} />}
      mfaStatus={mfaStatus}
      onReauthClose={totp.handleCloseReauthDialog}
      onReauthVerified={totp.handleRemoveWithReauth}
      pagination={totp.pagination}
      reauthOpen={totp.reauthDialogOpen}
    />
  )
}
