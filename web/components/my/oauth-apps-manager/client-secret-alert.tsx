'use client'

import { useId, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError from '@/lib/on-error'

interface ClientSecretAlertProps {
  clientId: string
  clientSecret: string
  onDismiss: () => void
}

export function ClientSecretAlert({ clientId, clientSecret, onDismiss }: ClientSecretAlertProps) {
  const t = useTranslations()
  const [copied, setCopied] = useState(false)
  const idPrefix = useId()

  async function copySecret() {
    try {
      await navigator.clipboard.writeText(clientSecret)
      setCopied(true)
    } catch (error) {
      onError(error, {
        fallback: t(
          'extracted.oauthAppsManager.clientSecretAlert.failedToCopyToClipboard_978a1dc5',
        ),
        skipSentry: true,
      })
    }
  }

  return (
    <div
      className='space-y-2 rounded-md border border-yellow-400 bg-yellow-50 p-4 dark:bg-yellow-950'
      data-pw='oauth-app-secret-alert'
    >
      <p className='text-sm font-semibold text-yellow-800 dark:text-yellow-200'>
        {t('extracted.oauthAppsManager.clientSecretAlert.saveThisClientSecretNowIt_c8a6f5b5')}
      </p>
      <div className='space-y-1'>
        <Label htmlFor={`${idPrefix}-client-id`}>
          {t('extracted.oauthAppsManager.clientSecretAlert.clientId_8726db01')}
        </Label>
        <Input
          id={`${idPrefix}-client-id`}
          value={clientId}
          readOnly
          className='font-mono text-sm'
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor={`${idPrefix}-client-secret`}>
          {t('extracted.oauthAppsManager.clientSecretAlert.clientSecret_4aded5fa')}
        </Label>
        <div className='flex items-center gap-2'>
          <Input
            id={`${idPrefix}-client-secret`}
            value={clientSecret}
            readOnly
            className='font-mono text-sm'
            data-pw='oauth-app-client-secret-input'
          />
          <Button
            type='button'
            size='sm'
            variant='outline'
            aria-label={
              copied
                ? t('extracted.oauthAppsManager.clientSecretAlert.copied_8d525e5f')
                : t('extracted.oauthAppsManager.clientSecretAlert.copyClientSecret_ed8fbed3')
            }
            onClick={copySecret}
          >
            {copied ? <Check className='h-4 w-4' /> : <Copy className='h-4 w-4' />}
          </Button>
        </div>
      </div>
      <Button
        type='button'
        size='sm'
        variant='ghost'
        className='text-xs'
        onClick={onDismiss}
        data-pw='oauth-app-secret-dismiss-button'
      >
        {t('extracted.oauthAppsManager.clientSecretAlert.dismiss_48845bff')}
      </Button>
    </div>
  )
}
