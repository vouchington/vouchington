'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { OAuthApp, UpdateOAuthAppInput } from '@/types/oauth-apps'
import { OAuthAppDetailsFields } from './oauth-app-details-fields'
import { hasValidOAuthAppDetails, parseRedirectUris } from './oauth-app-fields'

interface EditOAuthAppFormProps {
  app: OAuthApp
  onCancel: () => void
  /** Resolves `true` once the changes are saved, which closes the form. */
  onSave: (changes: UpdateOAuthAppInput) => Promise<boolean>
}

export function EditOAuthAppForm({ app, onCancel, onSave }: EditOAuthAppFormProps) {
  const t = useTranslations()
  const [name, setName] = useState(app.client_name)
  const [redirectUris, setRedirectUris] = useState(() => app.redirect_uris.join('\n'))
  const [saving, setSaving] = useState(false)
  const uris = parseRedirectUris(redirectUris)
  const changes: UpdateOAuthAppInput = {
    ...(name.trim() !== app.client_name && { client_name: name.trim() }),
    ...(uris.join('\n') !== app.redirect_uris.join('\n') && { redirect_uris: uris }),
  }
  const canSave = hasValidOAuthAppDetails(name, uris) && Object.keys(changes).length > 0

  async function handleSubmit() {
    setSaving(true)
    const saved = await onSave(changes)
    setSaving(false)
    if (saved) onCancel()
  }

  return (
    <form
      className='space-y-3'
      onSubmit={event => {
        event.preventDefault()
        void handleSubmit()
      }}
      data-pw='oauth-app-edit-form'
    >
      <OAuthAppDetailsFields
        idPrefix={`oauth-app-edit-${app.id}`}
        name={name}
        redirectUris={redirectUris}
        setName={setName}
        setRedirectUris={setRedirectUris}
      />
      {app.verified_at && (
        <p className='text-xs text-muted-foreground'>
          {t('extracted.oauthAppsManager.editOauthAppForm.changingTheNameOrRedirectUris_8e804a88')}
        </p>
      )}
      <div className='flex gap-2'>
        <Button
          type='submit'
          size='sm'
          loading={saving}
          disabled={saving || !canSave}
          data-pw='oauth-app-edit-save-button'
        >
          {t('extracted.oauthAppsManager.editOauthAppForm.save_1509f561')}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={saving}
          onClick={onCancel}
        >
          {t('extracted.oauthAppsManager.editOauthAppForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
