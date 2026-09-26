'use client'

import { useState } from 'react'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { getOAuthGrants, revokeOAuthGrant } from '@/lib/api/client/oauth-grants'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError, { onSuccess } from '@/lib/on-error'
import type { ListResponse } from '@/types/api-responses'
import type { OAuthGrant } from '@/types/oauth-apps'
import { ConnectedAppRow } from './connected-apps-manager/connected-app-row'

export function ConnectedAppsManager({ initialData }: { initialData: ListResponse<OAuthGrant> }) {
  const t = useTranslations()
  const pagination = usePaginatedList(
    initialData,
    '/api/v1/my/oauth-grants',
    {},
    { loadPage: after => getOAuthGrants({ after }) },
  )
  const [revokedIds, setRevokedIds] = useState<ReadonlySet<string>>(() => new Set())
  const grants: OAuthGrant[] = []
  for (const page of pagination.pages) {
    for (const grant of page.results) {
      if (!revokedIds.has(grant.id)) grants.push(grant)
    }
  }
  const handleLoadMore = pagination.loadMore

  async function handleRevoke(id: string) {
    try {
      await revokeOAuthGrant(id)
      setRevokedIds(prev => new Set(prev).add(id))
      onSuccess(t('extracted.my.connectedAppsManager.accessRevoked_42849e0b'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.connectedAppsManager.failedToRevokeAccess_d461cbfc'),
      })
    }
  }

  return (
    <InfiniteScroll
      hasNextPage={pagination.hasNextPage}
      endCursor={pagination.endCursor}
      onLoadMore={handleLoadMore}
      loadingMore={pagination.loadingMore}
      fetchError={pagination.fetchError}
      clearError={pagination.clearError}
      resetKey={pagination.resetKey}
    >
      {grants.length > 0 ? (
        <ul
          className='space-y-3'
          data-pw='connected-apps-list'
        >
          {grants.map(grant => (
            <ConnectedAppRow
              key={grant.id}
              grant={grant}
              onRevoke={handleRevoke}
            />
          ))}
        </ul>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {t('extracted.my.connectedAppsManager.noAppsHaveAccessToYour_64aaf35e')}
        </p>
      )}
    </InfiniteScroll>
  )
}
