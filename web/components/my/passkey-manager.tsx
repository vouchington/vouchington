'use client'

import type { ListResponse } from '@/types/api-responses'
import type { MfaStatus, Passkey } from '@/types/user'
import { MfaCredentialManagerShell } from './mfa-credential-manager-shell'
import { PasskeyManagerList } from './passkey-manager/passkey-manager-list'
import { PasskeyManagerSetup } from './passkey-manager/passkey-manager-setup'
import { usePasskeyManager } from './passkey-manager/use-passkey-manager'

interface Props {
  initialData: ListResponse<Passkey>
  mfaStatus: MfaStatus
}

export function PasskeyManager({ initialData, mfaStatus }: Props) {
  const passkey = usePasskeyManager(initialData, mfaStatus)

  return (
    <MfaCredentialManagerShell
      action={
        passkey.step === 'list'
          ? { handleAdd: () => passkey.setStep('add'), kind: 'list' }
          : { kind: 'setup', panel: <PasskeyManagerSetup passkey={passkey} /> }
      }
      credential='passkey'
      list={<PasskeyManagerList passkey={passkey} />}
      mfaStatus={mfaStatus}
      onReauthClose={passkey.handleCloseReauthDialog}
      onReauthVerified={passkey.handleRemoveWithReauth}
      pagination={passkey.pagination}
      reauthOpen={passkey.reauthDialogOpen}
    />
  )
}
