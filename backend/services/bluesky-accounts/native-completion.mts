import { read, beginTransaction, write } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { enqueueOnUserUpdated } from '@queues/entity-listeners/enqueues'
import createHttpError from 'http-errors'
import sql from 'sql-template-strings'
import { connectBlueskyAccountToUser } from './connect.mts'
import { lockBlueskyAuthorizationOwner } from './session-generation.mts'
import {
  createNativeCompletionToken,
  nativeCompletionProofMatches,
  nativeCompletionTokenMatches,
} from './native-completion-token.mts'
import {
  assertActiveNativeLinkUserState,
  getActiveNativeLinkUserState,
} from './native-user-state.mts'
import { persistNativeBlueskyLinkCompletion } from './native-completion-persistence.mts'

type CompletionRow = {
  authorization_id: string
  user_id: string
  bluesky_did: string
  handle: string
  token_hash: string
  expires_at: Date
}

export async function createNativeBlueskyLinkCompletion(input: {
  flowId: string
  userId: string
  did: string
  handle: string
}): Promise<string> {
  const { token, tokenHash } = createNativeCompletionToken(input.flowId)
  await persistNativeBlueskyLinkCompletion({ ...input, tokenHash })
  return token
}

export async function finalizeNativeBlueskyAccountLink(
  currentUserId: string,
  flowId: string,
  completionToken: string,
  completionProofVerifier: string,
): Promise<void> {
  const discovered = await findCompletion(flowId)
  if (!discovered) throw createHttpError(404, 'Bluesky link completion not found or expired')
  await using query = await beginTransaction()

  await lockBlueskyAuthorizationOwner(currentUserId, discovered.bluesky_did, flowId, query)
  const completion = await getLockedCompletion(flowId, query)
  assertCompletionOwnerAndToken(completion, currentUserId, flowId, completionToken)
  const proofChallenge = await getHandoffProofChallenge(flowId, currentUserId, query)
  if (!nativeCompletionProofMatches(completionProofVerifier, proofChallenge)) {
    throw createHttpError(404, 'Bluesky link completion not found or expired')
  }
  assertActiveNativeLinkUserState(await getActiveNativeLinkUserState(currentUserId, query))
  await connectBlueskyAccountToUser(currentUserId, completion.bluesky_did, completion.handle, {
    query,
    enqueueUserUpdate: false,
    linkAuthorizationId: flowId,
  })
  await write(
    sql`/* finalizeNativeBlueskyAccountLink:consume */
        DELETE FROM bluesky_link_completions WHERE authorization_id = ${flowId}`,
    { query },
  )

  await query.commit()
  void enqueueOnUserUpdated(currentUserId)
}

async function findCompletion(flowId: string): Promise<{ bluesky_did: string } | undefined> {
  const { rows } = await read<{ bluesky_did: string }>(sql`/* findNativeBlueskyLinkCompletion */
    SELECT bluesky_did FROM bluesky_link_completions WHERE authorization_id = ${flowId}`)
  return rows[0]
}

async function getLockedCompletion(
  flowId: string,
  query: TransactionQuery,
): Promise<CompletionRow> {
  const { rows } = await read<CompletionRow>(
    sql`/* getLockedNativeBlueskyLinkCompletion */
      SELECT authorization_id, user_id, bluesky_did, handle, token_hash, expires_at
      FROM bluesky_link_completions
      WHERE authorization_id = ${flowId}
      FOR UPDATE`,
    { query },
  )
  const completion = rows[0]
  if (!completion || completion.expires_at <= new Date()) {
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
