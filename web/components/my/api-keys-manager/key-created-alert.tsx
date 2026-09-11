'use client'

import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslations } from '@/lib/i18n/use-translations'

interface KeyCreatedAlertProps {
  copied: boolean
  rawKey: string
  onCopy: (text: string) => void
  onDismiss: () => void
}

export function KeyCreatedAlert({ copied, rawKey, onCopy, onDismiss }: KeyCreatedAlertProps) {
  const t = useTranslations()
  return (
    <div
      className='rounded-md border border-yellow-400 bg-yellow-50 p-4 dark:bg-yellow-950'
      data-pw='api-keys-created-alert'
    >
      <p className='mb-2 text-sm font-semibold text-yellow-800 dark:text-yellow-200'>
        {t('extracted.apiKeysManager.keyCreatedAlert.saveYourApiKeyItWill_76958c67')}
      </p>
      <div className='flex items-center gap-2'>
        <Input
          aria-label={t('extracted.apiKeysManager.keyCreatedAlert.newApiKey_e520a082')}
          value={rawKey}
          readOnly
          placeholder={t('extracted.apiKeysManager.keyCreatedAlert.generatedApiKey_3e788b36')}
          className='font-mono text-sm'
          data-pw='api-keys-created-raw-key-input'
        />
        <Button
          size='sm'
          variant='outline'
          aria-label={
            copied
              ? t('extracted.apiKeysManager.keyCreatedAlert.copied_8d525e5f')
              : t('extracted.apiKeysManager.keyCreatedAlert.copyApiKey_013c2b8b')
          }
          onClick={() => onCopy(rawKey)}
          data-pw='api-keys-copy-raw-key-button'
        >
          {copied ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
        </Button>
      </div>
      <Button
        size='sm'
        variant='ghost'
        className='mt-2 text-xs'
        onClick={onDismiss}
        data-pw='api-keys-dismiss-raw-key-button'
      >
        {t('extracted.apiKeysManager.keyCreatedAlert.dismiss_48845bff')}
      </Button>
    </div>
  )
}
