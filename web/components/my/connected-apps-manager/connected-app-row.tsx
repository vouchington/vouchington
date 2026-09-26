'use client'

import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { OAuthGrant } from '@/types/oauth-apps'

interface ConnectedAppRowProps {
  grant: OAuthGrant
  onRevoke: (id: string) => Promise<void>
}

export function ConnectedAppRow({ grant, onRevoke }: ConnectedAppRowProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)

  async function revoke() {
    setRevoking(true)
    await onRevoke(grant.id)
    setRevoking(false)
    setConfirming(false)
  }

  return (
    <li
      className='flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-start sm:justify-between'
      data-pw='connected-app-row'
    >
      <div className='space-y-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium'>{grant.client.client_name}</span>
          {grant.client.verified ? (
            <Badge variant='secondary'>
              <BadgeCheck
                aria-hidden='true'
                className='mr-1 h-3 w-3'
              />
              {t('extracted.connectedAppsManager.connectedAppRow.verified_4f783840')}
            </Badge>
          ) : (
            <Badge variant='outline'>
              {t('extracted.connectedAppsManager.connectedAppRow.unverified_33c8e8de')}
            </Badge>
          )}
        </div>
        <p className='break-all font-mono text-xs text-muted-foreground'>{grant.resource}</p>
        <div className='flex flex-wrap gap-1'>
          {grant.scopes.map(scope => (
            <Badge
              key={scope}
              variant='secondary'
              className='text-xs'
            >
              {scope}
            </Badge>
          ))}
        </div>
        <p className='text-xs text-muted-foreground'>
          {t(
            'extracted.connectedAppsManager.connectedAppRow.authorizedConsentedatLastUsedLastusedat_45a0956c',
            {
              consentedAt: formatUtcDate(grant.consented_at, uiLocale),
              lastUsedAt: formatUtcDate(grant.last_used_at, uiLocale),
            },
          )}
        </p>
      </div>
      <div className='flex shrink-0 flex-wrap items-center gap-2'>
        {confirming ? (
          <>
            <span className='text-sm text-destructive'>
              {t('extracted.connectedAppsManager.connectedAppRow.revokeAccess_8138e6ff')}
            </span>
            <Button
              size='sm'
              variant='destructive'
              loading={revoking}
              disabled={revoking}
              onClick={revoke}
              data-pw='connected-app-revoke-confirm-button'
            >
              {t('extracted.connectedAppsManager.connectedAppRow.confirm_eebdd24a')}
            </Button>
            <Button
              size='sm'
              variant='outline'
              disabled={revoking}
              onClick={() => setConfirming(false)}
            >
              {t('extracted.connectedAppsManager.connectedAppRow.cancel_19766ed6')}
            </Button>
          </>
        ) : (
          <Button
            size='sm'
            variant='outline'
            onClick={() => setConfirming(true)}
            data-pw='connected-app-revoke-button'
          >
            {t('extracted.connectedAppsManager.connectedAppRow.revokeAccess_ab292ddb')}
          </Button>
        )}
      </div>
    </li>
  )
}
