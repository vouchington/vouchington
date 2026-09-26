'use client'

import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { useOptionalAuth } from '@/lib/auth/context'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthApp } from '@/types/oauth-apps'
import type { ScopeCatalogEntry } from '@/types/scopes'
import { ClientSecretAlert } from './oauth-apps-manager/client-secret-alert'
import { OAuthAppRow } from './oauth-apps-manager/oauth-app-row'
import { RegisterOAuthAppForm } from './oauth-apps-manager/register-oauth-app-form'
import { useOAuthAppsManager } from './oauth-apps-manager/use-oauth-apps-manager'

interface OAuthAppsManagerProps {
  initialData: ListResponse<OAuthApp>
  scopeCatalog: readonly ScopeCatalogEntry[]
}

export function OAuthAppsManager({ initialData, scopeCatalog }: OAuthAppsManagerProps) {
  const t = useTranslations()
  const auth = useOptionalAuth()
  const isAdmin = auth?.currentUser?.roles?.includes('administrator') ?? false
  const manager = useOAuthAppsManager(initialData)
  const { pagination } = manager

  return (
    <section
      className='space-y-4'
      aria-labelledby='oauth-apps-heading'
      data-pw='oauth-apps-section'
    >
      <div className='space-y-1'>
        <h2
          id='oauth-apps-heading'
          className='text-lg font-semibold'
        >
          {t('extracted.my.oauthAppsManager.oauthApps_afff11a4')}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t('extracted.my.oauthAppsManager.registerAnAppToLetPeople_37b438b2')}
        </p>
      </div>
      {manager.issuedSecret && (
        <ClientSecretAlert
          key={manager.issuedSecret.clientSecret}
          clientId={manager.issuedSecret.clientId}
          clientSecret={manager.issuedSecret.clientSecret}
          onDismiss={manager.handleDismissIssuedSecret}
        />
      )}
      <InfiniteScroll
        hasNextPage={pagination.hasNextPage}
        endCursor={pagination.endCursor}
        onLoadMore={manager.handleLoadMore}
        loadingMore={pagination.loadingMore}
        fetchError={pagination.fetchError}
        clearError={pagination.clearError}
        resetKey={pagination.resetKey}
      >
        {manager.apps.length > 0 ? (
          <ul className='space-y-3'>
            {manager.apps.map(app => (
              <OAuthAppRow
                key={app.id}
                app={app}
                onRevoke={manager.handleRevoke}
                onRotate={manager.handleRotate}
                onUpdate={manager.handleUpdate}
              />
            ))}
          </ul>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.my.oauthAppsManager.youHaveNotRegisteredAnyOauth_40be670b')}
          </p>
        )}
      </InfiniteScroll>
      <RegisterOAuthAppForm
        isAdmin={isAdmin}
        scopeCatalog={scopeCatalog}
        onRegister={manager.handleRegister}
      />
    </section>
  )
}
