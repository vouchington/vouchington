'use client'

import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'

interface TokenState {
  dns_instructions: { hostname: string; value: string }
  well_known_instructions: { url: string; file_content: string }
}

interface DnsInstructionsProps {
  token: TokenState
  copied: boolean
  loadingVerify: boolean
  onCopy: (text: string) => void
  onVerify: () => void
}

export function DnsInstructions({
  token,
  copied,
  loadingVerify,
  onCopy,
  onVerify,
}: DnsInstructionsProps) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <p className='text-xs font-medium'>
        {t('extracted.topicClaims.verificationTokenInstructions.addThisTxtRecord_7fd21685')}
      </p>
      <div className='rounded border bg-muted p-2 font-mono text-xs space-y-1'>
        <p>
          {t('extracted.topicClaims.verificationTokenInstructions.host_95695f07')}{' '}
          <span className='select-all'>{token.dns_instructions.hostname}</span>
        </p>
        <p>
          {t('extracted.topicClaims.verificationTokenInstructions.value_224a3369')}{' '}
          <span className='select-all'>{token.dns_instructions.value}</span>
        </p>
      </div>
      <Button
        size='sm'
        variant='outline'
        onClick={() => onCopy(token.dns_instructions.value)}
      >
        {copied
          ? t('extracted.topicClaims.verificationTokenInstructions.copied_ea61bc15')
          : t('extracted.topicClaims.verificationTokenInstructions.copyValue_c019c0f8')}
      </Button>
      <div>
        <Button
          onClick={onVerify}
          loading={loadingVerify}
          disabled={loadingVerify}
          data-pw='verify-domain'
        >
          {loadingVerify
            ? t('extracted.topicClaims.verificationTokenInstructions.checking_2e5f79bb')
            : t('extracted.topicClaims.verificationTokenInstructions.verifyNow_db383efb')}
        </Button>
      </div>
    </div>
  )
}

interface WellKnownInstructionsProps {
  token: TokenState
  loadingVerify: boolean
  onVerify: () => void
}

export function WellKnownInstructions({
  token,
  loadingVerify,
  onVerify,
}: WellKnownInstructionsProps) {
  const t = useTranslations()
  return (
    <div className='space-y-2'>
      <p className='text-xs font-medium'>
        {t('extracted.topicClaims.verificationTokenInstructions.createThisFileAt_26e30f30')}
      </p>
      <p className='select-all rounded bg-muted p-2 font-mono text-xs'>
        {token.well_known_instructions.url}
      </p>
      <p className='text-xs font-medium'>
        {t('extracted.topicClaims.verificationTokenInstructions.withContent_5d0f61f7')}
      </p>
      <p className='select-all rounded bg-muted p-2 font-mono text-xs'>
        {token.well_known_instructions.file_content}
      </p>
      <Button
        onClick={onVerify}
        loading={loadingVerify}
        disabled={loadingVerify}
      >
        {loadingVerify
          ? t('extracted.topicClaims.verificationTokenInstructions.checking_2e5f79bb')
          : t('extracted.topicClaims.verificationTokenInstructions.verifyNow_db383efb')}
      </Button>
    </div>
  )
}
