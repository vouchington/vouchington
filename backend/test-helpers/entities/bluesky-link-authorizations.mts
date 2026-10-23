import { createHash } from 'node:crypto'
import { v7 } from 'uuid'
import { createTestAccountChangeActor } from '../account-change.mts'
import { read, write } from '@data-stores/psql'
import {
  observeTestPostgresQueryPools,
  type ObservedPostgresQueryPool,
} from '../postgres-query-pool-observer.mts'
import sql from 'sql-template-strings'

export interface TestBlueskyLinkAuthorizationRow {
  id: string
  status: string
  handle: string | null
}

export async function getTestBlueskyLinkAttachmentTime(
  authorizationId: string,
): Promise<string | null | undefined> {
  const { rows } = await read<{ attached_at: string | null }>(sql`
    /* getTestBlueskyLinkAttachmentTime */ SELECT attached_at::text AS attached_at
    FROM bluesky_link_authorizations WHERE id = ${authorizationId}
  `)
  return rows[0]?.attached_at
}

export async function getTestBlueskyLinkAuthorizationRow(
  authorizationId: string,
): Promise<TestBlueskyLinkAuthorizationRow | null> {
  const { rows } = await read<TestBlueskyLinkAuthorizationRow>(
    sql`/* getTestBlueskyLinkAuthorizationRow */
      SELECT id, status, handle
      FROM bluesky_link_authorizations
      WHERE id = ${authorizationId}`,
  )
  return rows[0] ?? null
}

export async function observeTestBlueskyCallbackAuthorizationReadPool<Result>(
  operation: () => Promise<Result>,
): Promise<{ result: Result; pools: ObservedPostgresQueryPool[] }> {
  return observeTestPostgresQueryPools('/* readBlueskyLinkAuthorization */', operation)
}

export function getTestBlueskyCompletionProofVerifier(flowId: string): string {
  return createHash('sha256').update(`test-bluesky-proof:${flowId}`).digest('base64url')
}

export async function ensureTestBlueskyLinkAuthorization(options: {
  authorizationId: string
  userId: string
  callbackMode?: 'web' | 'native'
  handle?: string
  initiatingSessionId?: string
}): Promise<void> {
  const existing = await read(
    '/* ensureTestBlueskyLinkAuthorization:existing */ SELECT 1 FROM bluesky_link_authorizations WHERE id = $1',
    [options.authorizationId],
  )
  if (existing.rows.length) return
  const initiatingSessionId =
    options.initiatingSessionId ?? (await createTestAccountChangeActor(options.userId)).session.sid
  const callbackMode = options.callbackMode ?? 'web'
  const completionProofChallenge =
    callbackMode === 'native'
      ? createHash('sha256')
          .update(getTestBlueskyCompletionProofVerifier(options.authorizationId))
          .digest('base64url')
      : null
  await write(sql`/* ensureTestBlueskyLinkAuthorization */
    INSERT INTO bluesky_link_authorizations (
      id, user_id, initiating_session_id, handle, callback_mode, completion_proof_challenge, expires_at
    ) VALUES (
      ${options.authorizationId}, ${options.userId}, ${initiatingSessionId}, ${options.handle ?? `${v7()}.bsky.social`},
      ${callbackMode}, ${completionProofChallenge}, ${new Date(Date.now() + 10 * 60 * 1000)}
    )
    ON CONFLICT (id) DO NOTHING`)
}
