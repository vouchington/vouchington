'use client'

import { useState } from 'react'
import { BadgeCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import { formatUtcDate } from '@ts-shared/utils/format'
import type { OAuthApp, UpdateOAuthAppInput } from '@/types/oauth-apps'
import { EditOAuthAppForm } from './edit-oauth-app-form'

type PendingAction = 'revoke' | 'rotate'

interface OAuthAppRowProps {
  app: OAuthApp
  onRevoke: (id: string) => Promise<void>
  onRotate: (id: string) => Promise<void>
  onUpdate: (id: string, changes: UpdateOAuthAppInput) => Promise<boolean>
}

export function OAuthAppRow({ app, onRevoke, onRotate, onUpdate }: OAuthAppRowProps) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState(false)

  async function confirm(action: PendingAction) {
    setBusy(true)
    await (action === 'revoke' ? onRevoke(app.id) : onRotate(app.id))
    setBusy(false)
    setConfirming(null)
  }

  return (
    <li
      className='space-y-3 rounded-md border p-4'
      data-pw='oauth-app-row'
    >
      <div className='space-y-1'>
        <div className='flex flex-wrap items-center gap-2'>
          <span className='font-medium'>{app.client_name}</span>
          {app.verified_at && (
            <Badge variant='secondary'>
              <BadgeCheck
                aria-hidden='true'
                className='mr-1 h-3 w-3'
              />
              {t('extracted.oauthAppsManager.oauthAppRow.verified_4f783840')}
            </Badge>
          )}
          <Badge variant='outline'>
            {app.client_type === 'confidential'
              ? t('extracted.oauthAppsManager.oauthAppRow.confidential_a3e83aee')
              : t('extracted.oauthAppsManager.oauthAppRow.public_591935b1')}
          </Badge>
        </div>
        <p className='text-xs text-muted-foreground'>
          {t('extracted.oauthAppsManager.oauthAppRow.clientIdClientid_df7f3d90', {
            clientId: app.client_id,
          })}
        </p>
        <ul className='font-mono text-xs text-muted-foreground'>
          {app.redirect_uris.map(uri => (
            <li
              key={uri}
              className='break-all'
            >
              {uri}
            </li>
          ))}
        </ul>
        <div className='flex flex-wrap gap-1'>
          {app.scopes.map(scope => (
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
          {t('extracted.oauthAppsManager.oauthAppRow.registeredCreatedat_e720b512', {
            createdAt: formatUtcDate(app.created_at, uiLocale),
          })}
        </p>
      </div>
      {editing && (
        <EditOAuthAppForm
          app={app}
          onCancel={() => setEditing(false)}
          onSave={changes => onUpdate(app.id, changes)}
        />
      )}
      {!editing && confirming && (
        <div className='flex flex-wrap items-center gap-2'>
          <span className='text-sm text-destructive'>
            {confirming === 'revoke'
              ? t('extracted.oauthAppsManager.oauthAppRow.revokeThisAppAndEveryToken_67faf7db')
              : t(
                  'extracted.oauthAppsManager.oauthAppRow.replaceTheClientSecretTheCurrent_3f0a5568',
                )}
          </span>
          <Button
            size='sm'
            variant='destructive'
            loading={busy}
            disabled={busy}
            onClick={() => confirm(confirming)}
            data-pw='oauth-app-confirm-button'
          >
            {t('extracted.oauthAppsManager.oauthAppRow.confirm_eebdd24a')}
          </Button>
          <Button
            size='sm'
            variant='outline'
            disabled={busy}
            onClick={() => setConfirming(null)}
          >
            {t('extracted.oauthAppsManager.oauthAppRow.cancel_19766ed6')}
          </Button>
        </div>
      )}
      {!editing && !confirming && (
        <div className='flex flex-wrap gap-2'>
          <Button
            size='sm'
            variant='outline'
            onClick={() => setEditing(true)}
            data-pw='oauth-app-edit-button'
          >
            {t('extracted.oauthAppsManager.oauthAppRow.edit_464c4ffd')}
          </Button>
          {app.token_endpoint_auth_method === 'client_secret_basic' && (
            <Button
              size='sm'
              variant='outline'
              onClick={() => setConfirming('rotate')}
              data-pw='oauth-app-rotate-secret-button'
            >
              {t('extracted.oauthAppsManager.oauthAppRow.rotateSecret_4405518d')}
            </Button>
          )}
          <Button
            size='sm'
            variant='outline'
            onClick={() => setConfirming('revoke')}
            data-pw='oauth-app-revoke-button'
          >
            {t('extracted.oauthAppsManager.oauthAppRow.revoke_87e6d00b')}
          </Button>
        </div>
      )}
    </li>
  )
}
