'use client'

import { AuthenticatorList } from './authenticator-list'
import type { useTotpManager } from './use-totp-manager'

type TotpManagerState = ReturnType<typeof useTotpManager>

export function TotpManagerList({ totp }: { totp: TotpManagerState }) {
  return (
    <AuthenticatorList
      authenticators={totp.authenticators}
      confirmingDeleteId={totp.confirmingDeleteId}
      loading={totp.loading}
      renameName={totp.renameName}
      renamingId={totp.renamingId}
      onConfirmRemove={totp.handleRemove}
      onRemoveClick={totp.handleRemoveClick}
      onRename={totp.handleRename}
      setConfirmingDeleteId={totp.setConfirmingDeleteId}
      setRenameName={totp.setRenameName}
      setRenamingId={totp.setRenamingId}
    />
  )
}
