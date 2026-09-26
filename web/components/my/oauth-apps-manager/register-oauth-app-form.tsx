'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { CreateOAuthAppInput, OAuthClientAuthMethod } from '@/types/oauth-apps'
import type { ScopeCatalogEntry } from '@/types/scopes'
import { ChoiceRadioGroup } from '../api-keys-manager/choice-radio-group'
import { ScopePicker } from '../api-keys-manager/scope-picker'
import {
  oauthScopeAudiences,
  scopeResourceRows,
  toggleScope,
} from '../api-keys-manager/scope-selection'
import { OAuthAppDetailsFields } from './oauth-app-details-fields'
import { hasValidOAuthAppDetails, parseRedirectUris } from './oauth-app-fields'

interface RegisterOAuthAppFormProps {
  isAdmin: boolean
  scopeCatalog: readonly ScopeCatalogEntry[]
  /** Resolves `true` once the app is registered, which clears the form. */
  onRegister: (input: CreateOAuthAppInput) => Promise<boolean>
}

interface RegisterOAuthAppDraft {
  name: string
  redirectUris: string
  authMethod: OAuthClientAuthMethod
  scopes: string[]
}

const EMPTY_DRAFT: RegisterOAuthAppDraft = {
  name: '',
  redirectUris: '',
  authMethod: 'client_secret_basic',
  scopes: [],
}

export function RegisterOAuthAppForm({
  isAdmin,
  scopeCatalog,
  onRegister,
}: RegisterOAuthAppFormProps) {
  const t = useTranslations()
  const [draft, setDraft] = useState(EMPTY_DRAFT)
  const [submitting, setSubmitting] = useState(false)
  const uris = parseRedirectUris(draft.redirectUris)
  const canRegister = hasValidOAuthAppDetails(draft.name, uris) && draft.scopes.length > 0

  function updateDraft(changes: Partial<RegisterOAuthAppDraft>) {
    setDraft(prev => ({ ...prev, ...changes }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    const registered = await onRegister({
      client_name: draft.name.trim(),
      redirect_uris: uris,
      token_endpoint_auth_method: draft.authMethod,
      scopes: draft.scopes,
    })
    setSubmitting(false)
    if (registered) setDraft(EMPTY_DRAFT)
  }

  return (
    <form
      className='space-y-3 rounded-md border p-4'
      onSubmit={event => {
        event.preventDefault()
        void handleSubmit()
      }}
      data-pw='oauth-app-register-form'
    >
      <h3 className='text-sm font-medium'>
        {t('extracted.oauthAppsManager.registerOauthAppForm.registerAnOauthApp_e81d241a')}
      </h3>
      <OAuthAppDetailsFields
        idPrefix='oauth-app-register'
        name={draft.name}
        redirectUris={draft.redirectUris}
        setName={name => updateDraft({ name })}
        setRedirectUris={redirectUris => updateDraft({ redirectUris })}
      />
      <ChoiceRadioGroup
        idPrefix='oauth-app-client-type'
        legend={t('extracted.oauthAppsManager.registerOauthAppForm.clientType_40a3b0cb')}
        options={[
          {
            value: 'client_secret_basic',
            label: t(
              'extracted.oauthAppsManager.registerOauthAppForm.confidentialRunsOnAServerAnd_4ee5f053',
            ),
            dataPw: 'oauth-app-client-type-confidential',
          },
          {
            value: 'none',
            label: t(
              'extracted.oauthAppsManager.registerOauthAppForm.publicRunsOnADeviceOr_fca0e0a8',
            ),
            dataPw: 'oauth-app-client-type-public',
          },
        ]}
        value={draft.authMethod}
        onChange={authMethod => updateDraft({ authMethod })}
      />
      <ScopePicker
        idPrefix='oauth-app-register'
        rows={scopeResourceRows(scopeCatalog, 'oauth', oauthScopeAudiences(isAdmin))}
        selected={draft.scopes}
        onToggle={(scope, checked) =>
          setDraft(prev => ({
            ...prev,
            scopes: toggleScope(scopeCatalog, prev.scopes, scope, checked),
          }))
        }
      />
      <Button
        type='submit'
        size='sm'
        loading={submitting}
        disabled={submitting || !canRegister}
        data-pw='oauth-app-register-button'
      >
        {t('extracted.oauthAppsManager.registerOauthAppForm.registerApp_02290f38')}
      </Button>
    </form>
  )
}
