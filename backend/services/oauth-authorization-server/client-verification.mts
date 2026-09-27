import { read, write } from '@data-stores/psql'
import type {
  AdminOAuthClientView,
  OAuthClientVerificationFilter,
  OAuthManagementPage,
} from './management-types.mts'

export type OAuthClientVerificationResult =
  | { outcome: 'verified'; client: AdminOAuthClientView }
  | { outcome: 'not_found' }
  | { outcome: 'conflict' }

export const OAUTH_CLIENT_VERIFICATION_FILTERS: readonly OAuthClientVerificationFilter[] = [
  'all',
  'unverified',
  'verified',
]

const OAUTH_CLIENT_VERIFICATION_LIST_SQL = {
  all: {
    first: `/* listOAuthClientsForVerification first */ SELECT id, client_id, client_name,
         client_type, redirect_uris, scopes, owner_user_id, verified_at, verified_by_id, created_at
       FROM oauth_clients
       WHERE metadata_url IS NULL
         AND revoked_at IS NULL
       ORDER BY id DESC
       LIMIT $1`,
    continuation: `/* listOAuthClientsForVerification continuation */ SELECT id, client_id,
         client_name, client_type, redirect_uris, scopes, owner_user_id, verified_at,
         verified_by_id, created_at
       FROM oauth_clients
       WHERE metadata_url IS NULL
         AND revoked_at IS NULL
         AND id < $1::uuid
       ORDER BY id DESC
       LIMIT $2`,
  },
  unverified: {
    first: `/* listOAuthClientsForVerification first */ SELECT id, client_id, client_name,
         client_type, redirect_uris, scopes, owner_user_id, verified_at, verified_by_id, created_at
       FROM oauth_clients
       WHERE metadata_url IS NULL
         AND revoked_at IS NULL
         AND verified_at IS NULL
       ORDER BY id DESC
       LIMIT $1`,
    continuation: `/* listOAuthClientsForVerification continuation */ SELECT id, client_id,
         client_name, client_type, redirect_uris, scopes, owner_user_id, verified_at,
         verified_by_id, created_at
       FROM oauth_clients
       WHERE metadata_url IS NULL
         AND revoked_at IS NULL
         AND verified_at IS NULL
         AND id < $1::uuid
       ORDER BY id DESC
       LIMIT $2`,
  },
  verified: {
    first: `/* listOAuthClientsForVerification first */ SELECT id, client_id, client_name,
         client_type, redirect_uris, scopes, owner_user_id, verified_at, verified_by_id, created_at
       FROM oauth_clients
       WHERE metadata_url IS NULL
         AND revoked_at IS NULL
         AND verified_at IS NOT NULL
       ORDER BY id DESC
       LIMIT $1`,
    continuation: `/* listOAuthClientsForVerification continuation */ SELECT id, client_id,
         client_name, client_type, redirect_uris, scopes, owner_user_id, verified_at,
         verified_by_id, created_at
       FROM oauth_clients
       WHERE metadata_url IS NULL
         AND revoked_at IS NULL
         AND verified_at IS NOT NULL
         AND id < $1::uuid
       ORDER BY id DESC
       LIMIT $2`,
  },
} as const

/** Administrator verification of client names is the gate for naming a client publicly. */
export function currentUserCanVerifyOAuthClients(currentUser: {
  roles: readonly string[]
}): boolean {
  return currentUser.roles.includes('administrator')
}

/** Lists active dynamically registered clients. Metadata-document clients are not verifiable. */
export async function listOAuthClientsForVerification(options: {
  verification: OAuthClientVerificationFilter
  limit: number
  afterId?: string
}): Promise<OAuthManagementPage<AdminOAuthClientView>> {
  const queries = OAUTH_CLIENT_VERIFICATION_LIST_SQL[options.verification]
  const { rows } =
    options.afterId === undefined
      ? await read<AdminOAuthClientView>(queries.first, [options.limit + 1])
      : await read<AdminOAuthClientView>(queries.continuation, [options.afterId, options.limit + 1])
  return { results: rows.slice(0, options.limit), hasNextPage: rows.length > options.limit }
}

/** What an administrator reviewed. An owner change to either field clears verification. */
export type OAuthClientVerificationReview = Pick<
  AdminOAuthClientView,
  'client_name' | 'redirect_uris'
>

/**
 * Verifies the exact name and redirect URIs the administrator reviewed. A rename or re-pointing
 * since the review, a revoked client or a metadata-document client is a conflict rather than a
 * silent verification.
 */
export async function verifyOAuthClient(
  currentUserId: string,
  id: string,
  reviewed: OAuthClientVerificationReview,
): Promise<OAuthClientVerificationResult> {
  const { rows } = await write<AdminOAuthClientView>(
    `/* verifyOAuthClient */ UPDATE oauth_clients
     SET verified_at = CURRENT_TIMESTAMP,
         verified_by_id = $2
     WHERE id = $1
       AND client_name = $3
       AND redirect_uris = $4::text[]
       AND metadata_url IS NULL
       AND revoked_at IS NULL
     RETURNING id, client_id, client_name, client_type, redirect_uris, scopes, owner_user_id,
       verified_at, verified_by_id, created_at`,
    [id, currentUserId, reviewed.client_name, reviewed.redirect_uris],
  )
  const client = rows[0]
  if (client) return { outcome: 'verified', client }
  const existing = await write(
    `/* verifyOAuthClient exists */ SELECT 1 FROM oauth_clients WHERE id = $1`,
    [id],
  )
  return existing.rowCount === 0 ? { outcome: 'not_found' } : { outcome: 'conflict' }
}

/** Clears verification. Returns false when no such client exists. */
export async function unverifyOAuthClient(id: string): Promise<boolean> {
  const result = await write(
    `/* unverifyOAuthClient */ UPDATE oauth_clients
     SET verified_at = NULL,
         verified_by_id = NULL
     WHERE id = $1`,
    [id],
  )
  return result.rowCount === 1
}
