'use client'

import { TotpSetupFlow } from './setup-flow'
import type { useTotpManager } from './use-totp-manager'

type TotpManagerState = ReturnType<typeof useTotpManager>

export function TotpManagerSetup({ totp }: { totp: TotpManagerState }) {
  return (
    <TotpSetupFlow
      loading={totp.loading}
      setupCode={totp.setupCode}
      setupVerificationProof={totp.setupVerificationProof}
      setupData={totp.setupData}
      setupName={totp.setupName}
      onStartSetup={totp.handleStartSetup}
      onConfirmSetup={totp.handleConfirmSetup}
      onVerifySetup={totp.handleVerifySetup}
      onCancelSetup={totp.handleCancelSetup}
      setSetupCode={totp.setSetupCode}
      setSetupName={totp.setSetupName}
    />
  )
}
