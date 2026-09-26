import { beginTransaction, read, type TransactionQuery } from '@data-stores/psql'
import { isApiScope } from '@modules/scopes'
import { hashToken } from '@modules/token-secrets'
import { generateOAuthClientSecret, insertOAuthClient, validateClientName } from './clients.mts'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { invalidClientMetadata } from './errors.mts'
import { validateRedirectUris } from './redirect-uri-validation.mts'
import type {
  IssuedOAuthApp,
  OAuthAppChanges,
  OAuthAppView,
  OAuthManagementPage,
} from './management-types.mts'

/** Upper bound on an app's scope list; comfortably above the number of canonical scopes. */
export const MAX_OAUTH_APP_SCOPES = 32

export type OwnedOAuthAppInput = {
  client_name: unknown
  redirect_uris: unknown
  token_endpoint_auth_method?: unknown
  scopes: unknown
}

export async function listOwnedOAuthApps(
  currentUserId: string,
  options: { limit: number; afterId?: string },
): Promise<OAuthManagementPage<OAuthAppView>> {
  const { rows } = await read<OAuthAppView>(
    `/* listOwnedOAuthApps */ SELECT id, client_id, client_name, client_type,
       token_endpoint_auth_method, redirect_uris, scopes, verified_at, created_at, updated_at
     FROM oauth_clients
     WHERE owner_user_id = $1
       AND revoked_at IS NULL
       AND ($2::uuid IS NULL OR id < $2::uuid)
     ORDER BY id DESC
     LIMIT $3`,
    [currentUserId, options.afterId ?? null, options.limit + 1],
  )
  return { results: rows.slice(0, options.limit), hasNextPage: rows.length > options.limit }
}

/**
 * Registers an app owned by `currentUserId` through the RFC 7591 validators, so signed-in owners
 * and anonymous dynamic registration share one policy. `scopes` is a typed list: each entry must
 * be one canonical scope, so a space inside an entry cannot smuggle in a second scope.
 */
export async function createOwnedOAuthApp(
  currentUserId: string,
  input: OwnedOAuthAppInput,
): Promise<IssuedOAuthApp> {
  const { scopes } = input
  if (
    !Array.isArray(scopes) ||
    scopes.length > MAX_OAUTH_APP_SCOPES ||
    !scopes.every(scope => typeof scope === 'string' && isApiScope(scope))
  ) {
    throw invalidClientMetadata('scopes must list canonical scopes')
  }
  const { client, clientSecret } = await mutateAsActiveOwner(currentUserId, query =>
    insertOAuthClient(
      {
        client_name: input.client_name,
        redirect_uris: input.redirect_uris,
        token_endpoint_auth_method: input.token_endpoint_auth_method,
        scope: scopes.join(' '),
      },
      currentUserId,
      query,
    ),
  )
  return {
    oauth_app: {
      id: client.id,
      client_id: client.client_id,
      client_name: client.client_name,
      client_type: client.client_type,
      token_endpoint_auth_method: client.token_endpoint_auth_method,
      redirect_uris: client.redirect_uris,
      scopes: client.scopes,
      verified_at: null,
      created_at: client.created_at,
      updated_at: client.updated_at,
    },
    client_secret: clientSecret ?? null,
  }
}

/**
 * Renames an owned app or replaces its redirect URIs. A change to either value clears staff
 * verification in the same statement, because staff verified the old name and destinations.
 */
export async function updateOwnedOAuthApp(
  currentUserId: string,
  appId: string,
  changes: OAuthAppChanges,
): Promise<OAuthAppView | null> {
  const clientName =
    changes.client_name === undefined ? null : validateClientName(changes.client_name)
  const redirectUris =
    changes.redirect_uris === undefined ? null : validateRedirectUris(changes.redirect_uris)
  if (clientName === null && redirectUris === null) {
    throw invalidClientMetadata('client_name or redirect_uris is required')
  }
  const { rows } = await mutateAsActiveOwner(currentUserId, query =>
    query<OAuthAppView>(
      `/* updateOwnedOAuthApp */ UPDATE oauth_clients
       SET client_name = COALESCE($3::text, client_name),
           redirect_uris = COALESCE($4::text[], redirect_uris),
           verified_at = CASE
             WHEN (COALESCE($3::text, client_name), COALESCE($4::text[], redirect_uris))
               IS DISTINCT FROM (client_name, redirect_uris) THEN NULL
             ELSE verified_at
           END,
           verified_by_id = CASE
             WHEN (COALESCE($3::text, client_name), COALESCE($4::text[], redirect_uris))
               IS DISTINCT FROM (client_name, redirect_uris) THEN NULL
             ELSE verified_by_id
           END
       WHERE id = $1
         AND owner_user_id = $2
         AND revoked_at IS NULL
       RETURNING id, client_id, client_name, client_type, token_endpoint_auth_method,
         redirect_uris, scopes, verified_at, created_at, updated_at`,
      [appId, currentUserId, clientName, redirectUris],
    ),
  )
  return rows[0] ?? null
}

export type OAuthAppSecretRotation =
  | { outcome: 'rotated'; issued: IssuedOAuthApp }
  | { outcome: 'not_found' }
  | { outcome: 'public_client' }

/** Replaces a confidential app's secret. The new secret is returned once and stored as a hash. */
export async function rotateOwnedOAuthAppSecret(
  currentUserId: string,
  appId: string,
): Promise<OAuthAppSecretRotation> {
  const clientSecret = generateOAuthClientSecret()
  return mutateAsActiveOwner(currentUserId, async query => {
    const { rows } = await query<OAuthAppView>(
      `/* rotateOwnedOAuthAppSecret */ UPDATE oauth_clients
       SET client_secret_hash = $3
       WHERE id = $1
         AND owner_user_id = $2
         AND revoked_at IS NULL
         AND client_type = 'confidential'
       RETURNING id, client_id, client_name, client_type, token_endpoint_auth_method,
         redirect_uris, scopes, verified_at, created_at, updated_at`,
      [appId, currentUserId, hashToken(OAUTH_SECRET_PURPOSES.clientSecret, clientSecret)],
    )
    const app = rows[0]
    if (app) return { outcome: 'rotated', issued: { oauth_app: app, client_secret: clientSecret } }
    const owned = await query(
      `/* rotateOwnedOAuthAppSecret owned */ SELECT 1
       FROM oauth_clients
       WHERE id = $1
         AND owner_user_id = $2
         AND revoked_at IS NULL`,
      [appId, currentUserId],
    )
    return owned.rowCount === 0 ? { outcome: 'not_found' } : { outcome: 'public_client' }
  })
}

/** Revokes an owned app. Bearer, refresh and code paths reject a revoked client's credentials. */
export async function revokeOwnedOAuthApp(currentUserId: string, appId: string): Promise<boolean> {
  const result = await mutateAsActiveOwner(currentUserId, query =>
    query(
      `/* revokeOwnedOAuthApp */ UPDATE oauth_clients
       SET revoked_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND owner_user_id = $2
         AND revoked_at IS NULL`,
      [appId, currentUserId],
    ),
  )
  return result.rowCount === 1
}

/**
 * Runs an owner's app mutation behind the account-deletion fence, so a request that authenticated
 * just before the owner's deletion committed cannot change the app or mint a secret afterwards.
 */
async function mutateAsActiveOwner<T>(
  ownerId: string,
  mutate: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  await query(`/* mutateAsActiveOwner */ SELECT fn_lock_active_user_for_mutation($1)`, [ownerId])
  const result = await mutate(query)
  await query.commit()
  return result
}
