'use client'

import { AddPasskeyForm } from './add-passkey-form'
import type { usePasskeyManager } from './use-passkey-manager'

type PasskeyManagerState = ReturnType<typeof usePasskeyManager>

export function PasskeyManagerSetup({ passkey }: { passkey: PasskeyManagerState }) {
  return (
    <AddPasskeyForm
      loading={passkey.loading}
      newName={passkey.newName}
      onAddPasskey={passkey.handleAddPasskey}
      setNewName={passkey.setNewName}
      setStep={passkey.setStep}
    />
  )
}
