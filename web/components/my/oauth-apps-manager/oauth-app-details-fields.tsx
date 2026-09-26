'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useTranslations } from '@/lib/i18n/use-translations'
import { MAX_CLIENT_NAME_LENGTH } from './oauth-app-fields'

interface OAuthAppDetailsFieldsProps {
  idPrefix: string
  name: string
  redirectUris: string
  setName: (name: string) => void
  setRedirectUris: (redirectUris: string) => void
}

export function OAuthAppDetailsFields({
  idPrefix,
  name,
  redirectUris,
  setName,
  setRedirectUris,
}: OAuthAppDetailsFieldsProps) {
  const t = useTranslations()
  return (
    <>
      <div className='space-y-1'>
        <Label htmlFor={`${idPrefix}-name`}>
          {t('extracted.oauthAppsManager.oauthAppDetailsFields.appName_e6ad3996')}
        </Label>
        <Input
          id={`${idPrefix}-name`}
          value={name}
          maxLength={MAX_CLIENT_NAME_LENGTH}
          onChange={event => setName(event.target.value)}
          data-pw='oauth-app-name-input'
        />
      </div>
      <div className='space-y-1'>
        <Label htmlFor={`${idPrefix}-redirect-uris`}>
          {t('extracted.oauthAppsManager.oauthAppDetailsFields.redirectUris_721353f1')}
        </Label>
        <Textarea
          id={`${idPrefix}-redirect-uris`}
          value={redirectUris}
          rows={3}
          aria-describedby={`${idPrefix}-redirect-uris-hint`}
          className='font-mono text-sm'
          onChange={event => setRedirectUris(event.target.value)}
          data-pw='oauth-app-redirect-uris-input'
        />
        <p
          id={`${idPrefix}-redirect-uris-hint`}
          className='text-xs text-muted-foreground'
        >
          {t('extracted.oauthAppsManager.oauthAppDetailsFields.onePerLineUpTo10_0bfc1c47')}
        </p>
      </div>
    </>
  )
}
