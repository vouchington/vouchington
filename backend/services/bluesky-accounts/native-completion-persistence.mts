import { beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { lockBlueskyAuthorizationOwner } from './session-generation.mts'
import {
  assertActiveNativeLinkUserState,
  getActiveNativeLinkUserState,
} from './native-user-state.mts'

const COMPLETION_TTL_MS = 10 * 60 * 1000

type NativePersistenceState = {
  status: string
  authorization_expires_at: Date
  completion_token_hash: string | null
  completion_expires_at: Date | null
  account_present: boolean
}

async function lockAndReadNativePersistenceState(
  input: { flowId: string; userId: string; did: string },
  query: TransactionQuery,
  afterAuthorizationLock?: () => Promise<void>,
): Promise<NativePersistenceState | undefined> {
  await lockBlueskyAuthorizationOwner(input.userId, input.did, input.flowId, query)
  await afterAuthorizationLock?.()
  return readNativePersistenceState(input, query)
}

async function readNativePersistenceState(
  input: { flowId: string; userId: string; did: string },
  query: TransactionQuery,
): Promise<NativePersistenceState | undefined> {
  const { rows } = await query<NativePersistenceState>(sql`/* readNativePersistenceState */
    SELECT link_auth.status,
           link_auth.expires_at AS authorization_expires_at,
           completion.token_hash AS completion_token_hash,
           completion.expires_at AS completion_expires_at,
           EXISTS (
             SELECT 1 FROM bluesky_linked_accounts account
             WHERE account.bluesky_did = ${input.did}
               AND account.link_authorization_id = link_auth.id
               AND account.user_id IS NULL
           ) AS account_present
    FROM bluesky_link_authorizations link_auth
    LEFT JOIN bluesky_link_completions completion ON completion.authorization_id = link_auth.id
    WHERE link_auth.id = ${input.flowId}
      AND link_auth.user_id = ${input.userId}
      AND link_auth.claimed_did = ${input.did}
      AND link_auth.callback_mode = 'native'`)
  return rows[0]
}

export async function persistNativeBlueskyLinkCompletion(
  input: {
    flowId: string
    userId: string
    did: string
    handle: string
    tokenHash: string
  },
  dependencies?: { afterAuthorizationLock?: () => Promise<void> },
): Promise<void> {
  const expiresAt = new Date(Date.now() + COMPLETION_TTL_MS)
  await using query = await beginTransaction()
  const persistenceState = await lockAndReadNativePersistenceState(
    input,
    query,
    dependencies?.afterAuthorizationLock,
  )
  let outcome: 'active' | 'missing' | 'nonmatching' | 'ready' | 'suspended' | 'unclaimable'
  if (!persistenceState) {
    outcome = 'unclaimable'
  } else if (persistenceState.status === 'handoff_ready') {
    const validWinner =
      persistenceState.account_present &&
      persistenceState.authorization_expires_at > new Date() &&
      persistenceState.completion_expires_at !== null &&
      persistenceState.completion_expires_at > new Date() &&
      persistenceState.completion_token_hash !== null
    if (validWinner) {
      outcome = persistenceState.completion_token_hash === input.tokenHash ? 'ready' : 'nonmatching'
    } else {
      await rejectNativeAuthorization(input, query)
      outcome = 'unclaimable'
    }
  } else {
    const userState = await getActiveNativeLinkUserState(input.userId, query)
    if (userState !== 'active') {
      await rejectNativeAuthorization(input, query)
      outcome = userState
    } else {
      const { rowCount } = await write(
        sql`/* createNativeBlueskyLinkCompletion */
        -- One authorization_id is supplied per native completion; the SELECT can yield at most one row.
        /* no-mistakes: deadlock-safe */
        INSERT INTO bluesky_link_completions (
          authorization_id, user_id, bluesky_did, handle, token_hash, expires_at
        )
        SELECT ${input.flowId}, ${input.userId}, ${input.did}, ${input.handle}, ${input.tokenHash}, ${expiresAt}
        FROM bluesky_link_authorizations link_auth
        WHERE link_auth.id = ${input.flowId}
          AND link_auth.user_id = ${input.userId}
          AND link_auth.callback_mode = 'native'
          AND link_auth.status = 'callback_claimed'
          AND link_auth.claimed_did = ${input.did}
          AND link_auth.expires_at > CURRENT_TIMESTAMP
          AND EXISTS (
            SELECT 1 FROM bluesky_linked_accounts account
            WHERE account.bluesky_did = ${input.did}
              AND account.link_authorization_id = link_auth.id
              AND account.user_id IS NULL
          )
        ON CONFLICT (authorization_id) DO UPDATE
        SET token_hash = EXCLUDED.token_hash
        WHERE bluesky_link_completions.user_id = EXCLUDED.user_id
          AND bluesky_link_completions.bluesky_did = EXCLUDED.bluesky_did
          AND bluesky_link_completions.token_hash = EXCLUDED.token_hash`,
        { query },
      )
      if (!rowCount) {
        outcome = 'unclaimable'
      } else {
        await query(sql`/* createNativeBlueskyLinkCompletion:handoffReady */
          UPDATE bluesky_link_authorizations
          SET status = 'handoff_ready'
          WHERE id = ${input.flowId} AND status = 'callback_claimed'`)
        outcome = userState
      }
    }
  }

  await query.commit()
  if (outcome === 'ready') return
  if (outcome === 'nonmatching' || outcome === 'unclaimable') {
    throw createHttpError(409, 'This Bluesky authorization is not claimable')
  }
  assertActiveNativeLinkUserState(outcome)
}

async function rejectNativeAuthorization(
  input: { flowId: string; userId: string; did: string },
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* rejectNativeAuthorization */
    WITH deleted_completion AS (
      DELETE FROM bluesky_link_completions
      WHERE authorization_id = ${input.flowId}
      RETURNING authorization_id
    ), deleted_account AS (
      DELETE FROM bluesky_linked_accounts
      WHERE bluesky_did = ${input.did}
        AND link_authorization_id = ${input.flowId}
        AND user_id IS NULL
      RETURNING link_authorization_id
    )
    UPDATE bluesky_link_authorizations
    SET status = 'rejected', handle = NULL
    WHERE id = ${input.flowId}
      AND user_id = ${input.userId}
      AND status IN ('callback_claimed', 'handoff_ready')`)
}
