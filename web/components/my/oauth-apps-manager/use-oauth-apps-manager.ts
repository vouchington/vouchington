import { useState } from 'react'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import {
  createOAuthApp,
  getOAuthApps,
  revokeOAuthApp,
  rotateOAuthAppSecret,
  updateOAuthApp,
} from '@/lib/api/client/oauth-apps'
import { useTranslations } from '@/lib/i18n/use-translations'
import onError, { onSuccess } from '@/lib/on-error'
import type { ListResponse } from '@/types/api-responses'
import type {
  CreateOAuthAppInput,
  IssuedOAuthApp,
  OAuthApp,
  UpdateOAuthAppInput,
} from '@/types/oauth-apps'

export interface IssuedClientSecret {
  appId: string
  clientId: string
  clientSecret: string
}

export function useOAuthAppsManager(initialData: ListResponse<OAuthApp>) {
  const t = useTranslations()
  const pagination = usePaginatedList(
    initialData,
    '/api/v1/my/oauth-apps',
    {},
    { loadPage: after => getOAuthApps({ after }) },
  )
  const [createdApps, setCreatedApps] = useState<OAuthApp[]>([])
  // Edits can clear `verified_at` server-side, so a changed app is always the server's response.
  const [serverAppsById, setServerAppsById] = useState<ReadonlyMap<string, OAuthApp>>(
    () => new Map(),
  )
  const [revokedIds, setRevokedIds] = useState<ReadonlySet<string>>(() => new Set())
  // Secrets can't be fetched again, so each stays until the owner dismisses it.
  const [issuedSecrets, setIssuedSecrets] = useState<readonly IssuedClientSecret[]>([])

  const appsById = new Map<string, OAuthApp>()
  for (const app of [...createdApps, ...pagination.pages.flatMap(page => page.results)]) {
    if (appsById.has(app.id) || revokedIds.has(app.id)) continue
    appsById.set(app.id, serverAppsById.get(app.id) ?? app)
  }

  function acceptIssued({ oauth_app: app, client_secret: clientSecret }: IssuedOAuthApp) {
    setServerAppsById(prev => new Map(prev).set(app.id, app))
    if (!clientSecret) return
    // Rotation invalidates the app's previous secret, so the new one replaces its alert.
    setIssuedSecrets(prev => [
      { appId: app.id, clientId: app.client_id, clientSecret },
      ...withoutSecretFor(prev, app.id),
    ])
  }

  async function handleRegister(input: CreateOAuthAppInput): Promise<boolean> {
    try {
      const issued = await createOAuthApp(input)
      setCreatedApps(prev => [issued.oauth_app, ...prev])
      acceptIssued(issued)
      onSuccess(t('extracted.my.oauthAppsManager.oauthAppRegistered_4cc04a30'))
      return true
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.oauthAppsManager.failedToRegisterTheOauthApp_8bcb0aaa'),
      })
      return false
    }
  }

  async function handleUpdate(id: string, changes: UpdateOAuthAppInput): Promise<boolean> {
    try {
      const { oauth_app } = await updateOAuthApp(id, changes)
      setServerAppsById(prev => new Map(prev).set(oauth_app.id, oauth_app))
      onSuccess(t('extracted.my.oauthAppsManager.oauthAppSaved_4f633bda'))
      return true
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.oauthAppsManager.failedToSaveTheOauthApp_85e1ca50'),
      })
      return false
    }
  }

  async function handleRotate(id: string): Promise<void> {
    try {
      acceptIssued(await rotateOAuthAppSecret(id))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.oauthAppsManager.failedToRotateTheClientSecret_eb505b3a'),
      })
    }
  }

  async function handleRevoke(id: string): Promise<void> {
    try {
      await revokeOAuthApp(id)
      setRevokedIds(prev => new Set(prev).add(id))
      setIssuedSecrets(prev => withoutSecretFor(prev, id))
      onSuccess(t('extracted.my.oauthAppsManager.oauthAppRevoked_3b7394c5'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.oauthAppsManager.failedToRevokeTheOauthApp_73da1074'),
      })
    }
  }

  return {
    apps: [...appsById.values()],
    issuedSecrets,
    pagination,
    handleDismissIssuedSecret: (appId: string) =>
      setIssuedSecrets(prev => withoutSecretFor(prev, appId)),
    handleLoadMore: pagination.loadMore,
    handleRegister,
    handleRevoke,
    handleRotate,
    handleUpdate,
  }
}

function withoutSecretFor(secrets: readonly IssuedClientSecret[], appId: string) {
  return secrets.filter(secret => secret.appId !== appId)
}
