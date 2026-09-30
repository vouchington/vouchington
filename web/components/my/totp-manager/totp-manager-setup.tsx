'use client'

import { TotpSetupFlow } from './setup-flow'
import type { useTotpManager } from './use-totp-manager'

type TotpManagerState = ReturnType<typeof useTotpManager>

export function TotpManagerSetup({ totp }: { totp: TotpManagerState }) {
  return (
    <TotpSetupFlow
      loading={totp.loading}
      setupCode={totp.setupCode}
      setupData={totp.setupData}
      setupName={totp.setupName}
      onStartSetup={totp.handleStartSetup}
      onVerifySetup={totp.handleVerifySetup}
      setSetupCode={totp.setSetupCode}
      setSetupData={totp.setSetupData}
      setSetupName={totp.setSetupName}
      setStep={totp.setStep}
    />
  )
}
