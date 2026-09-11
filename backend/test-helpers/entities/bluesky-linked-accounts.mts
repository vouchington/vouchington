import { read, beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 } from 'uuid'
import { encryptSecret, hashToken } from '@modules/token-secrets'
import { createHash, randomBytes } from 'node:crypto'

export interface TestBlueskyLinkedAccountRow {
  bluesky_did: string
  user_id: string | null
  handle: string | null
  link_authorization_id: string
  session_ciphertext: string
  created_at: Date
  updated_at: Date
}

export * from './bluesky-follow-records.mts'
export * from './bluesky-link-authorizations.mts'
export * from './bluesky-disconnect.mts'

// Seeds a linked-and-attached bluesky_linked_accounts row directly, bypassing the real AT
// Protocol OAuth dance (Playwright cannot drive a live Bluesky authorization server). The DID and
// session ciphertext are randomized fixtures, not real AT Protocol credentials — callers that need
// a real session must go through the actual OAuth callback flow instead.
export async function insertTestBlueskyLinkedAccount(options: {
  userId: string | null
  did?: string
  handle?: string | null
  nativeFlowId?: string | null
  linkingUserId?: string | null
  authorizationId?: string
  authorizationExpiresAt?: Date
}): Promise<{
  bluesky_did: string
  user_id: string | null
  handle: string | null
  link_authorization_id: string
}> {
  const did = options.did ?? `did:plc:test${v7().replaceAll('-', '')}`
  const handle = options.handle === undefined ? `${v7()}.bsky.social` : options.handle
  const nativeFlowId = options.nativeFlowId === undefined ? null : options.nativeFlowId
  const linkingUserId = options.linkingUserId === undefined ? null : options.linkingUserId
  const authorizationUserId = linkingUserId ?? options.userId
  if (!authorizationUserId) {
    throw new Error('An unattached test Bluesky account requires linkingUserId')
  }
  const authorizationId = options.authorizationId ?? v7()
  const callbackMode = nativeFlowId === null ? 'web' : 'native'
  const status = options.userId === null ? 'callback_claimed' : 'attached'
  const proofChallenge =
    callbackMode === 'native'
      ? createHash('sha256')
          .update(getTestBlueskyCompletionProofVerifier(authorizationId))
          .digest('base64url')
      : null
  const sessionCiphertext = encryptSecret('{}', `bluesky:session:${did}`)
  await using transaction = await beginTransaction()
  await transaction(sql`/* insertTestBlueskyLinkAuthorization */
        INSERT INTO bluesky_link_authorizations (
          id, user_id, handle, callback_mode, status, completion_proof_challenge,
          claimed_did, expires_at
        ) VALUES (
          ${authorizationId}, ${authorizationUserId}, ${handle ?? `${v7()}.bsky.social`},
          ${callbackMode}, ${status}, ${proofChallenge}, ${did},
          ${options.authorizationExpiresAt ?? new Date(Date.now() + 10 * 60 * 1000)}
        )`)
  const { rows } = await transaction(sql`/* insertTestBlueskyLinkedAccount */
        INSERT INTO bluesky_linked_accounts (
          bluesky_did,
          user_id,
          handle,
          link_authorization_id,
          session_ciphertext
        )
        VALUES (
          ${did},
          ${options.userId},
          ${handle},
          ${authorizationId},
          ${sessionCiphertext}
        )
        RETURNING bluesky_did, user_id, handle, link_authorization_id`)
  await transaction.commit()
  return rows[0] as {
    bluesky_did: string
    user_id: string | null
    handle: string | null
    link_authorization_id: string
  }
}

export async function setTestBlueskyLinkCompletionExpiresAt(
  flowId: string,
  expiresAt: Date,
): Promise<void> {
  await write(sql`/* setTestBlueskyLinkCompletionExpiresAt */
    UPDATE bluesky_link_completions
    SET expires_at = ${expiresAt}
    WHERE authorization_id = ${flowId}`)
}

export async function testBlueskyLinkCompletionExists(flowId: string): Promise<boolean> {
  const { rows } = await read(sql`/* testBlueskyLinkCompletionExists */
    SELECT 1 FROM bluesky_link_completions WHERE authorization_id = ${flowId}`)
  return rows.length > 0
}

export async function getTestBlueskyLinkCompletionTokenHash(
  flowId: string,
): Promise<string | null> {
  const { rows } = await read(sql`/* getTestBlueskyLinkCompletionTokenHash */
    SELECT token_hash FROM bluesky_link_completions WHERE authorization_id = ${flowId}`)
  return (rows[0]?.token_hash as string | undefined) ?? null
}

export async function insertTestBlueskyLinkCompletion(options: {
  flowId: string
  userId: string
  did: string
  handle?: string
  expiresAt?: Date
  claimOwnership?: boolean
}): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const tokenHash = hashToken(`bluesky-native-link-completion:${options.flowId}`, token)
  if (options.claimOwnership !== false) {
    const { rowCount } = await write(sql`/* insertTestBlueskyLinkCompletion:claimOwnership */
      UPDATE bluesky_link_authorizations
      SET status = 'handoff_ready'
      WHERE id = ${options.flowId}
        AND user_id = ${options.userId}
        AND claimed_did = ${options.did}
        AND callback_mode = 'native'
        AND status IN ('callback_claimed', 'handoff_ready')
        AND EXISTS (
          SELECT 1 FROM bluesky_linked_accounts account
          WHERE account.bluesky_did = ${options.did}
            AND account.link_authorization_id = bluesky_link_authorizations.id
            AND account.user_id IS NULL
        )`)
    if (!rowCount) throw new Error('Test Bluesky provider session could not be claimed')
  }
  await write(sql`/* insertTestBlueskyLinkCompletion */
    INSERT INTO bluesky_link_completions (
      authorization_id, user_id, bluesky_did, handle, token_hash, expires_at
    ) VALUES (
      ${options.flowId},
      ${options.userId},
      ${options.did},
      ${options.handle ?? `${v7()}.bsky.social`},
      ${tokenHash},
      ${options.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000)}
    )`)
  return token
}

export function getTestBlueskyCompletionProofVerifier(flowId: string): string {
  return createHash('sha256').update(`test-bluesky-proof:${flowId}`).digest('base64url')
}

export async function ensureTestBlueskyLinkAuthorization(options: {
  authorizationId: string
  userId: string
  callbackMode?: 'web' | 'native'
  handle?: string
}): Promise<void> {
  const callbackMode = options.callbackMode ?? 'web'
  const completionProofChallenge =
    callbackMode === 'native'
      ? createHash('sha256')
          .update(getTestBlueskyCompletionProofVerifier(options.authorizationId))
          .digest('base64url')
      : null
  await write(sql`/* ensureTestBlueskyLinkAuthorization */
    INSERT INTO bluesky_link_authorizations (
      id, user_id, handle, callback_mode, completion_proof_challenge, expires_at
    ) VALUES (
      ${options.authorizationId}, ${options.userId}, ${options.handle ?? `${v7()}.bsky.social`},
      ${callbackMode}, ${completionProofChallenge}, ${new Date(Date.now() + 10 * 60 * 1000)}
    )
    ON CONFLICT (id) DO NOTHING`)
}

// Raw-row read (including the encrypted session_ciphertext column) for asserting
// @services/bluesky-accounts's storage behavior in tests — e.g. that the ciphertext never
// contains a recognizable plaintext token, or that a row's bluesky_did/session survive an
// unrelated handle update.
export async function getTestBlueskyLinkedAccountRow(
  did: string,
): Promise<TestBlueskyLinkedAccountRow | null> {
  const { rows } = await read(
    `SELECT bluesky_did, user_id, handle, link_authorization_id,
            session_ciphertext, created_at, updated_at
     FROM bluesky_linked_accounts
     WHERE bluesky_did = $1`,
    [did],
  )
  return (rows[0] as TestBlueskyLinkedAccountRow | undefined) ?? null
}
