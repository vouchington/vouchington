'use client'

import { useId } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import type { TotpAuthenticator } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface TotpSetupData {
  authenticator: TotpAuthenticator
  secret: string
  uri: string
}

interface SetupFlowProps {
  loading: boolean
  setupCode: string
  setupData: TotpSetupData | null
  setupName: string
  onStartSetup: (e: React.FormEvent) => void
  onVerifySetup: (code: string) => void
  setSetupCode: (code: string) => void
  setSetupData: (data: TotpSetupData | null) => void
  setSetupName: (name: string) => void
  setStep: (step: 'list' | 'setup') => void
}

export function TotpSetupFlow({
  loading,
  setupCode,
  setupData,
  setupName,
  onStartSetup,
  onVerifySetup,
  setSetupCode,
  setSetupData,
  setSetupName,
  setStep,
}: SetupFlowProps) {
  const t = useTranslations()
  const setupNameId = useId()
  const setupCodeId = useId()

  if (!setupData) {
    return (
      <form
        onSubmit={onStartSetup}
        className='space-y-3'
      >
        <div className='space-y-1'>
          <Label htmlFor={setupNameId}>
            {t('extracted.totpManager.setupFlow.authenticatorNameOptional_4c1f1e74')}
          </Label>
          <Input
            id={setupNameId}
            value={setupName}
            onChange={e => setSetupName(e.target.value)}
            placeholder={t('extracted.totpManager.setupFlow.eGGoogleAuthenticatorAuthy_673df46c')}
            maxLength={100}
            data-pw='totp-setup-name-input'
          />
          <p className='text-xs text-muted-foreground'>
            {t('extracted.totpManager.setupFlow.giveThisAuthenticatorANameTo_2ee101ff')}
          </p>
        </div>
        <div className='flex gap-2'>
          <Button
            type='submit'
            loading={loading}
            disabled={loading}
            data-pw='totp-start-setup-button'
          >
            {loading
              ? t('extracted.totpManager.setupFlow.settingUp_e9d6212e')
              : t('extracted.totpManager.setupFlow.startSetup_76e684d8')}
          </Button>
          <Button
            type='button'
            variant='outline'
            onClick={() => {
              setStep('list')
              setSetupName('')
            }}
          >
            {t('extracted.totpManager.setupFlow.cancel_19766ed6')}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-2'>
        <p
          className='text-sm font-medium'
          data-pw='totp-setup-qr-prompt'
        >
          {t('extracted.totpManager.setupFlow.scanThisQrCodeWithYour_65752db3')}
        </p>
        <div className='inline-block rounded-md border p-3'>
          <QRCodeSVG
            value={setupData.uri}
            size={200}
          />
        </div>
        <p className='text-xs text-muted-foreground'>
          {t('extracted.totpManager.setupFlow.orEnterThisCodeManually_bab8ed0c')}
        </p>
        <code className='block rounded bg-muted px-3 py-2 text-sm font-mono break-all'>
          {setupData.secret}
        </code>
      </div>
      <div className='space-y-2'>
        <Label htmlFor={setupCodeId}>
          {t('extracted.totpManager.setupFlow.enterThe6DigitCodeFrom_0fb3dfb0')}
        </Label>
        <InputOTP
          id={setupCodeId}
          maxLength={6}
          value={setupCode}
          onChange={(value: string) => {
            setSetupCode(value)
            if (value.length === 6) onVerifySetup(value)
          }}
          disabled={loading}
          pattern={/^\d*$/}
          inputMode='numeric'
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <div className='flex gap-2'>
        <Button
          onClick={() => onVerifySetup(setupCode)}
          loading={loading}
          disabled={loading || setupCode.length < 6}
        >
          {loading
            ? t('extracted.totpManager.setupFlow.verifying_2ec1ac7d')
            : t('extracted.totpManager.setupFlow.verifyAndSave_42090fcb')}
        </Button>
        <Button
          type='button'
          variant='outline'
          onClick={() => {
            setStep('list')
            setSetupData(null)
            setSetupCode('')
            setSetupName('')
          }}
        >
          {t('extracted.totpManager.setupFlow.cancel_19766ed6')}
        </Button>
      </div>
    </div>
  )
}
