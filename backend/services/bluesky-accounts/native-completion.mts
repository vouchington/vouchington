import { lockCurrentBlueskyInitiatingSession } from './initiating-session.mts'
import { read, beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueOnUserUpdatedBestEffort } from '@queues/entity-listeners/enqueues'
import type { AccountChangeSession } from '@services/mfa/active-account-session'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { connectBlueskyAccountInLockedTransaction } from './connect-locked.mts'
import { lockBlueskyAuthorizationOwner } from './session-generation.mts'
import {
  nativeCompletionProofMatches,
  nativeCompletionTokenMatches,
} from './native-completion-token.mts'
import {
  assertActiveNativeLinkUserState,
  getActiveNativeLinkUserState,
} from './native-user-state.mts'

type CompletionRow = {
  account_link_authorization_id: string
  user_id: string
  bluesky_did: string
  handle: string
  token_hash: string
  expires_at: Date
}

export async function finalizeNativeBlueskyAccountLink(
  currentUserId: string,
  currentSession: AccountChangeSession,
  flowId: string,
  completionToken: string,
  completionProofVerifier: string,
  completionNow: () => Date,
): Promise<void> {
  const discovered = await findCompletion(flowId)
  if (!discovered) throw createHttpError(404, 'Bluesky link completion not found or expired')
  await using query = await beginTransaction()

  const { actorSessionId, completion } = await lockNativeBlueskyCompletionAdmission(
    currentUserId,
    currentSession,
    flowId,
    discovered.bluesky_did,
    query,
    completionNow,
  )
  assertCompletionOwnerAndToken(completion, currentUserId, flowId, completionToken)
  const proofChallenge = await getHandoffProofChallenge(flowId, currentUserId, query)
  if (!nativeCompletionProofMatches(completionProofVerifier, proofChallenge)) {
    throw createHttpError(404, 'Bluesky link completion not found or expired')
  }
  assertActiveNativeLinkUserState(await getActiveNativeLinkUserState(currentUserId, query))
  await connectBlueskyAccountInLockedTransaction(
    currentUserId,
    completion.bluesky_did,
    completion.handle,
    flowId,
    query,
    actorSessionId,
  )
  await write(
    sql`/* finalizeNativeBlueskyAccountLink:consume */
        DELETE FROM bluesky_link_completions WHERE account_link_authorization_id = ${flowId}`,
    { query },
  )

  await query.commit()
  await enqueueOnUserUpdatedBestEffort(currentUserId)
}

async function lockNativeBlueskyCompletionAdmission(
  currentUserId: string,
  currentSession: AccountChangeSession,
  flowId: string,
  did: string,
  query: TransactionQuery,
  completionNow: () => Date,
): Promise<{ actorSessionId: string; completion: CompletionRow }> {
  const actorSessionId = await lockCurrentBlueskyInitiatingSession(
    currentUserId,
    currentSession,
    flowId,
    query,
  )
  const completion = await lockBlueskyCompletionOwnerAndRead(
    currentUserId,
    did,
    flowId,
    query,
    completionNow,
  )
  return { actorSessionId, completion }
}

async function lockBlueskyCompletionOwnerAndRead(
  currentUserId: string,
  did: string,
  flowId: string,
  query: TransactionQuery,
  completionNow: () => Date,
): Promise<CompletionRow> {
  await lockBlueskyAuthorizationOwner(currentUserId, did, flowId, query)
  return getLockedCompletion(flowId, query, completionNow)
}

async function findCompletion(flowId: string): Promise<{ bluesky_did: string } | undefined> {
  const { rows } = await read<{ bluesky_did: string }>(sql`/* findNativeBlueskyLinkCompletion */
    SELECT account.bluesky_did
    FROM bluesky_link_completions completion
    JOIN bluesky_linked_accounts account ON account.link_authorization_id = completion.account_link_authorization_id
    WHERE completion.account_link_authorization_id = ${flowId}`)
  return rows[0]
}

async function getLockedCompletion(
  flowId: string,
  query: TransactionQuery,
  completionNow: () => Date,
): Promise<CompletionRow> {
  const { rows } = await read<CompletionRow>(
    sql`/* getLockedNativeBlueskyLinkCompletion */
      SELECT completion.account_link_authorization_id, completion.user_id, account.bluesky_did,
             completion.handle, completion.token_hash, completion.expires_at
      FROM bluesky_link_completions completion
      JOIN bluesky_linked_accounts account ON account.link_authorization_id = completion.account_link_authorization_id
      WHERE completion.account_link_authorization_id = ${flowId}
      FOR UPDATE OF completion`,
    { query },
  )
  const completion = rows[0]
  if (!completion || completion.expires_at <= completionNow()) {
    throw createHttpError(404, 'Bluesky link completion not found or expired')
  }
  return completion
}

async function getHandoffProofChallenge(
  flowId: string,
  userId: string,
  query: TransactionQuery,
): Promise<string> {
  const { rows } = await query<{ completion_proof_challenge: string }>(sql`/* getHandoffProof */
    SELECT completion_proof_challenge
    FROM bluesky_link_authorizations
    WHERE id = ${flowId}
      AND user_id = ${userId}
      AND callback_mode = 'native'
      AND status = 'handoff_ready'
      AND expires_at > CURRENT_TIMESTAMP`)
  if (!rows[0]?.completion_proof_challenge) {
    throw createHttpError(404, 'Bluesky link completion not found or expired')
  }
  return rows[0].completion_proof_challenge
}

function assertCompletionOwnerAndToken(
  completion: CompletionRow,
  userId: string,
  flowId: string,
  completionToken: string,
): void {
  if (completion.user_id !== userId) {
    throw createHttpError(403, 'This Bluesky link was started by another Voucha user')
  }
  if (!nativeCompletionTokenMatches(flowId, completionToken, completion.token_hash)) {
    throw createHttpError(404, 'Bluesky link completion not found or expired')
  }
}
