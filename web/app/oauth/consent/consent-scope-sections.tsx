'use client'

import { scopeAudienceLabelKey } from '@/components/my/api-keys-manager/scope-audience-label'
import { scopeDescriptionMessageKey } from '@/components/my/api-keys-manager/scope-description'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ScopeCatalogResponse } from '@/types/scopes'
import { groupConsentScopes } from './scope-groups'

const OWN_PRIVATE_POST_RELATIONS_WRITE_SCOPE = 'post-relations.owned-private:write'

export function ConsentScopeSections({
  catalog,
  scopes,
  sensitiveScopes,
}: {
  catalog: ScopeCatalogResponse
  scopes: readonly string[]
  sensitiveScopes: readonly string[]
}) {
  const t = useTranslations()
  const descriptions = new Map(catalog.scopes.map(entry => [entry.scope, entry.description_key]))
  const groups = groupConsentScopes(scopes, sensitiveScopes, catalog)
  const renderScopes = (entries: readonly string[]) =>
    entries.map(scope => (
      <li key={scope}>
        <code>{scope}</code>
        {descriptions.get(scope) && (
          <p>{t(scopeDescriptionMessageKey(descriptions.get(scope)!))}</p>
        )}
        {scope === OWN_PRIVATE_POST_RELATIONS_WRITE_SCOPE && (
          <p data-pw='oauth-consent-private-post-relations-permission'>
            {t('extracted.apiKeysManager.scopePicker.allowOwnPrivatePostRelationsAndTags_1c840aa0')}
          </p>
        )}
      </li>
    ))
  return groups.map(group => (
    <section
      key={group.audience ?? 'other'}
      className='space-y-2'
    >
      <h2 className='text-sm font-semibold'>
        {group.audience
          ? t(scopeAudienceLabelKey(group.audience))
          : t('settings.apiKeys.audience.other')}
      </h2>
      {group.normal.length > 0 && (
        <div>
          <h3 className='text-sm font-medium'>{t('shared.oauth.consent.permissionsHeading')}</h3>
          <ul
            className='mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground'
            data-pw='oauth-consent-scopes'
          >
            {renderScopes(group.normal)}
          </ul>
        </div>
      )}
      {group.sensitive.length > 0 && (
        <div>
          <h3 className='text-sm font-medium'>
            {t('shared.oauth.consent.sensitivePermissionsHeading')}
          </h3>
          <ul
            className='mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground'
            data-pw='oauth-consent-sensitive-scopes'
          >
            {renderScopes(group.sensitive)}
          </ul>
        </div>
      )}
    </section>
  ))
}
