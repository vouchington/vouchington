'use client'

import { PasskeyList } from './passkey-list'
import type { usePasskeyManager } from './use-passkey-manager'

type PasskeyManagerState = ReturnType<typeof usePasskeyManager>

export function PasskeyManagerList({ passkey }: { passkey: PasskeyManagerState }) {
  return (
    <PasskeyList
      confirmingDeleteId={passkey.confirmingDeleteId}
      loading={passkey.loading}
      passkeys={passkey.passkeys}
      renameName={passkey.renameName}
      renamingId={passkey.renamingId}
      onConfirmRemove={passkey.handleRemove}
      onRemoveClick={passkey.handleRemoveClick}
      onRename={passkey.handleRename}
      setConfirmingDeleteId={passkey.setConfirmingDeleteId}
      setRenameName={passkey.setRenameName}
      setRenamingId={passkey.setRenamingId}
    />
  )
}
