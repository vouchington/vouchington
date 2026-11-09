import { lockBlueskyInitiatingSession } from './initiating-session.mts'
import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { read, beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { encryptSecret, decryptSecret } from '@modules/token-secrets'
import type { NodeSavedSession, NodeSavedSessionStore } from '@modules/bluesky-oauth'
import {
  getBlueskySessionAuthorizationContext,
  isBlueskySessionPersistenceBlocked,
  type BlueskySessionAuthorizationContext,
} from './session-lifecycle-context.mts'
import { throwBlueskySessionPersistenceError } from './session-persistence-error.mts'
import {
  appendExactBlueskySessionOwner,
  createBlueskySessionLifecycleConflict,
  revokeExactBlueskySession,
} from './session-generation.mts'

export { deleteBlueskySessionForRejectedAuthorization } from './session-generation.mts'

// Purpose string doubles as the AES-256-GCM authenticated associated data — must exactly match
// the migration's COMMENT ON COLUMN bluesky_linked_accounts.session_ciphertext.
function blueskySessionSecretPurpose(did: string): string {
  return `bluesky:session:${did}`
}

// Postgres-backed NodeSavedSessionStore against bluesky_linked_accounts, keyed by DID. The SDK
// invokes set() on the initial OAuth callback and again on every token refresh. The callback is
// wrapped in session-lifecycle-context.mts, so it can persist an attributed authorization.
// Restore, refresh, and revoke also carry the exact attached
// owner/generation; context-free writes fail closed.
export class BlueskySessionStore implements NodeSavedSessionStore {
  async get(did: string): Promise<NodeSavedSession | undefined> {
    const authorization = getBlueskySessionAuthorizationContext()
    const getQuery = sql`/* BlueskySessionStore.get */
      SELECT session_ciphertext
      FROM bluesky_linked_accounts
      WHERE bluesky_did = ${did}
    `
    if (authorization) appendExactBlueskySessionOwner(getQuery, authorization)
    const { rows } = await read(getQuery)
    const row = rows[0] as { session_ciphertext: string } | undefined
    if (!row) return undefined
    const plaintext = decryptSecret(row.session_ciphertext, blueskySessionSecretPurpose(did))
    return JSON.parse(plaintext) as NodeSavedSession
  }

  async set(did: string, session: NodeSavedSession): Promise<void> {
    if (isBlueskySessionPersistenceBlocked()) return
    const sessionCiphertext = encryptSecret(
      JSON.stringify(session),
      blueskySessionSecretPurpose(did),
    )
    const authorization = getBlueskySessionAuthorizationContext()
    if (!authorization) throw createBlueskySessionLifecycleConflict(did)

    await using query = await beginTransaction()

    if (authorization.owner.kind === 'linking') {
      await lockBlueskyInitiatingSession(
        authorization.owner.userId,
        authorization.authorizationId,
        query,
      )
    }
    if (authorization.owner.kind === 'attached') {
      await refreshAttachedSession(did, sessionCiphertext, authorization, query)
    } else {
      await persistAuthorizedSession(did, sessionCiphertext, authorization, query)
    }

    await query.commit()
  }

  // The SDK deletes this live credential on unlink or unrecoverable refresh failure;
  // unlike an inert profile, it cannot remain as a tombstone.
  async del(did: string): Promise<void> {
    const authorization = getBlueskySessionAuthorizationContext()
    if (!authorization) throw createBlueskySessionLifecycleConflict(did)
    await using query = await beginTransaction()

    await revokeExactBlueskySession(did, authorization, query)

    await query.commit()
  }
}

async function persistAuthorizedSession(
  did: string,
  sessionCiphertext: string,
  authorization: BlueskySessionAuthorizationContext,
  query: TransactionQuery,
): Promise<void> {
  if (authorization.owner.kind !== 'linking') {
    throw createBlueskySessionLifecycleConflict(did)
  }
  const { rows: authorizationRows } = await query<{
    status: FiniteValue<'bluesky_link_authorization_statuses'>
    callback_mode: FiniteValue<'oauth_callback_modes'>
    claimed_did: string | null
    active_user: boolean
    unexpired: boolean
  }>(sql`/* BlueskySessionStore.set:lockAuthorization */
    SELECT
      link_auth.status,
      link_auth.callback_mode,
      link_auth.claimed_did,
      link_auth.expires_at > CURRENT_TIMESTAMP AS unexpired,
      EXISTS (
        SELECT 1 FROM users
        WHERE id = link_auth.user_id
          AND deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM user_suspensions
            WHERE user_id = users.id AND lifted_at IS NULL
          )
      ) AS active_user
    FROM bluesky_link_authorizations link_auth
    WHERE link_auth.id = ${authorization.authorizationId}
      AND link_auth.user_id = ${authorization.owner.userId}
    FOR UPDATE`)
  const authorizationRow = authorizationRows[0]
  if (!authorizationRow?.active_user) {
    await throwBlueskySessionPersistenceError(authorization.owner.userId, did, query)
  }
  if (
    !authorizationRow.unexpired ||
    authorizationRow.callback_mode !== authorization.callbackMode ||
    !(
      authorizationRow.status === 'pending' ||
      (authorizationRow.status === 'callback_claimed' && authorizationRow.claimed_did === did)
    )
  ) {
    throw createBlueskySessionLifecycleConflict(did)
  }
  const { rowCount } = await query(sql`/* BlueskySessionStore.set:authorizedCallback */
    INSERT INTO bluesky_linked_accounts (
      bluesky_did,
      link_authorization_id,
      session_ciphertext
    )
    SELECT
      ${did},
      ${authorization.authorizationId},
      ${sessionCiphertext}
    WHERE EXISTS (
      SELECT 1 FROM bluesky_link_authorizations link_auth
      JOIN users owner ON owner.id = link_auth.user_id AND owner.deleted_at IS NULL
      JOIN user_sessions actor ON actor.id = link_auth.initiating_session_id AND actor.user_id = owner.id
      WHERE link_auth.id = ${authorization.authorizationId}
        AND link_auth.user_id = ${authorization.owner.userId}
        AND link_auth.status IN ('pending', 'callback_claimed')
        AND actor.revoked_at IS NULL AND actor.expires_at > CURRENT_TIMESTAMP
        AND NOT EXISTS (
          SELECT 1 FROM user_session_revocation_cutoffs cutoff
          WHERE cutoff.user_id = actor.user_id AND actor.authenticated_at <= cutoff.cutoff_at
            AND actor.id IS DISTINCT FROM cutoff.preserved_session_id
        )
        AND actor.device_token_digest IS NOT NULL AND actor.device_token_encrypted IS NOT NULL
        AND actor.device_token_issued_at IS NOT NULL AND actor.device_token_binding IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM user_suspensions WHERE user_id = owner.id AND lifted_at IS NULL)
    )
    ON CONFLICT (bluesky_did) DO UPDATE
    SET session_ciphertext = EXCLUDED.session_ciphertext
    WHERE bluesky_linked_accounts.user_id IS NULL
      AND bluesky_linked_accounts.link_authorization_id = EXCLUDED.link_authorization_id
    RETURNING bluesky_did`)
  if (!rowCount) {
    await throwBlueskySessionPersistenceError(authorization.owner.userId, did, query)
  }
  if (authorizationRow.status === 'pending') {
    await query(sql`/* BlueskySessionStore.set:claimAuthorization */
      UPDATE bluesky_link_authorizations
      SET callback_claimed_at = clock_timestamp(), claimed_did = ${did}
      WHERE id = ${authorization.authorizationId} AND status = 'pending'`)
  }
}

async function refreshAttachedSession(
  did: string,
  sessionCiphertext: string,
  authorization: BlueskySessionAuthorizationContext,
  query: TransactionQuery,
): Promise<void> {
  const { rowCount } = await query(sql`/* BlueskySessionStore.set:refreshAttachedSession */
    UPDATE bluesky_linked_accounts
    SET session_ciphertext = ${sessionCiphertext}
    WHERE bluesky_did = ${did}
      AND link_authorization_id = ${authorization.authorizationId}
      AND user_id = ${authorization.owner.userId}
      AND EXISTS (
        SELECT 1 FROM bluesky_link_authorizations
        WHERE id = ${authorization.authorizationId}
          AND user_id = ${authorization.owner.userId}
          AND status = 'attached'
      )`)
  if (!rowCount) throw createBlueskySessionLifecycleConflict(did)
}
