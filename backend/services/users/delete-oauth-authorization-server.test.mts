import { describe, expect, it } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { createTestUser } from '@voucha/test-helpers'
import {
  getTestOAuthClientAfterUserPurge,
  getTestOAuthDeletionAuditCount,
  getTestOAuthDeletionFamilyEvents,
  getTestOAuthDeletionRows,
  hasTestUserDeletionResidual,
  expireTestOAuthDeletionChild,
  setTestOAuthDeletionRevokedAt,
  withTestOAuthDeletionRollback,
} from '@voucha/test-helpers/entities/oauth-deletion'
import { assignTestOAuthClientOwner } from '@voucha/test-helpers/entities/oauth-client-management'
import {
  createTestUserDirect,
  hardDeleteTestUser,
  softDeleteUser,
} from '@voucha/test-helpers/entities/users'
import {
  createTestApprovedOAuthAuthorization,
  TEST_OAUTH_RESOURCE,
} from '@services/oauth-authorization-server/test-support'
import { createUserDeletionRequest, processUserDeletionBatch } from '@services/user-deletions'
import { getUserDeletionRequestForTest } from '@services/user-deletions/lifecycle.test-support'
import {
  beginOAuthAuthorizationRequest,
  createOAuthBrowserBindingHash,
  decideOAuthAuthorizationRequest,
  exchangeOAuthAuthorizationCode,
  exchangeOAuthRefreshToken,
  revokeOAuthCredentialsForDeletedUserBatch,
} from '@services/oauth-authorization-server'
import { processUserDeletionCredentialsBatch } from './delete-phase-credentials.mts'
import { deleteUser } from './delete.mts'
import { drainUserDeletionForTest } from './delete-test-support.mts'

async function createCredentialChain(userId: string, rotations: number) {
  const flow = await createTestApprovedOAuthAuthorization({ id: userId })
  let tokens = await exchangeOAuthAuthorizationCode({
    clientId: flow.client.client_id,
    code: flow.code,
    codeVerifier: flow.verifier,
    redirectUri: flow.redirectUri,
  })
  for (let generation = 0; generation < rotations; generation++) {
    tokens = await exchangeOAuthRefreshToken({
      clientId: flow.client.client_id,
      refreshToken: tokens.refresh_token,
    })
  }
  return flow
}

async function issueOnExistingClient(userId: string, clientId: string, redirectUri: string) {
  const verifier = randomBytes(32).toString('base64url')
  const deviceId = uuidv7()
  const sessionId = uuidv7()
  const request = await beginOAuthAuthorizationRequest({
    clientId,
    codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
    codeChallengeMethod: 'S256',
    deviceId,
    redirectUri,
    resource: TEST_OAUTH_RESOURCE,
    responseType: 'code',
    scope: 'mcp.user:read',
    sessionId,
    state: randomBytes(16).toString('base64url'),
    userId,
  })
  const decision = await decideOAuthAuthorizationRequest(
    userId,
    request.request_id,
    'approve',
    createOAuthBrowserBindingHash(deviceId, sessionId),
  )
  const code = new URL(decision.redirect_uri).searchParams.get('code')
  if (!code) throw new Error('Authorization code was not issued')
  await exchangeOAuthAuthorizationCode({ clientId, code, codeVerifier: verifier, redirectUri })
}

async function drainCredentials(userId: string, batchSize: number): Promise<void> {
  for (let delivery = 0; delivery < 100; delivery++) {
    if (!(await processUserDeletionCredentialsBatch(userId, batchSize)).hasMore) return
  }
  throw new Error('OAuth credential cleanup failed to converge in 100 deliveries')
}

describe('OAuth authorization-server account deletion', () => {
  it('keeps finalization open while OAuth credentials remain, then completes after cleanup', async () => {
    const user = await createTestUserDirect({ withEmail: false })
    await createCredentialChain(user.id, 0)
    const request = await createUserDeletionRequest(user.id, user.id)
    let attemptId = request.processingAttemptId
    for (let phase = 0; phase < 7; phase++) {
      const successor = await processUserDeletionBatch(request.id, attemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      })
      if (!successor) throw new Error('Expected a successor before finalization')
      attemptId = successor.processingAttemptId
    }
    const blocked = await processUserDeletionBatch(request.id, attemptId, {
      async processPhaseBatch() {
        return { hasMore: false }
      },
    })
    if (!blocked) throw new Error('OAuth residual must prevent completion')
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({ completedAt: null })
    await drainCredentials(user.id, 1)
    await expect(
      processUserDeletionBatch(request.id, blocked.processingAttemptId, {
        async processPhaseBatch() {
          return { hasMore: false }
        },
      }),
    ).resolves.toBeNull()
    expect(await getUserDeletionRequestForTest(request.id)).toMatchObject({
      completedAt: expect.any(Date),
    })
  })

  it('converges through the real account-deletion phases and completes with revoked OAuth history', async () => {
    const user = await createTestUser({ withEmail: false })
    const flow = await createCredentialChain(user.id, 2)
    await assignTestOAuthClientOwner(flow.client.client_id, user.id)
    const attempt = await deleteUser(user, user)
    await drainUserDeletionForTest(attempt)
    expect(await getUserDeletionRequestForTest(attempt.requestId)).toMatchObject({
      completedAt: expect.any(Date),
    })
    expect((await getTestOAuthDeletionRows(user.id)).every(row => row.revoked_at !== null)).toBe(
      true,
    )
    expect(await getTestOAuthDeletionFamilyEvents(user.id)).toHaveLength(1)
  })

  it('revokes one bounded credential page per credentials delivery, retains timestamps and events on retry', async () => {
    const user = await createTestUserDirect({ withEmail: false })
    const unrelated = await createTestUserDirect({ withEmail: false })
    const owned = await createCredentialChain(user.id, 5)
    await createCredentialChain(user.id, 1)
    await assignTestOAuthClientOwner(owned.client.client_id, user.id)
    await issueOnExistingClient(unrelated.id, owned.client.client_id, owned.redirectUri)
    const unrelatedBefore = await getTestOAuthDeletionRows(unrelated.id)
    expect(unrelatedBefore.map(row => row.kind)).toEqual(['access', 'family', 'grant', 'refresh'])
    const initial = await getTestOAuthDeletionRows(user.id)
    expect(initial.filter(row => row.kind === 'refresh')).toHaveLength(8)
    await softDeleteUser(user.id)

    let previous = initial
    for (const credential of initial) {
      const result = await processUserDeletionCredentialsBatch(user.id, 1)
      expect(result).toEqual({ hasMore: true })
      const next = await getTestOAuthDeletionRows(user.id)
      expect(next.map(row => row.id)).toContain(credential.id)
      const prior = previous
      const newlyRevoked = next.filter(
        (row, index) => row.revoked_at !== null && prior[index]?.revoked_at === null,
      )
      expect(newlyRevoked).toHaveLength(1)
      expect(
        next.filter((_, index) => prior[index]?.revoked_at !== null).map(row => row.revoked_at),
      ).toEqual(prior.filter(row => row.revoked_at !== null).map(row => row.revoked_at))
      previous = next
    }
    expect(await processUserDeletionCredentialsBatch(user.id, 1)).toEqual({ hasMore: false })
    expect(previous.every(row => row.revoked_at !== null)).toBe(true)
    expect(await getTestOAuthDeletionFamilyEvents(user.id)).toHaveLength(2)
    expect(await getTestOAuthDeletionRows(unrelated.id)).toEqual(unrelatedBefore)
    expect(await hasTestUserDeletionResidual(user.id)).toBe(false)
    expect(await processUserDeletionCredentialsBatch(user.id, 1)).toEqual({ hasMore: false })
    expect(await getTestOAuthDeletionRows(user.id)).toEqual(previous)
    expect(await getTestOAuthDeletionFamilyEvents(user.id)).toHaveLength(2)
  })

  it('rolls back a page and its family event together', async () => {
    const user = await createTestUserDirect({ withEmail: false })
    await createCredentialChain(user.id, 0)
    const before = await getTestOAuthDeletionRows(user.id)
    const mutations = await withTestOAuthDeletionRollback(async query => [
      await revokeOAuthCredentialsForDeletedUserBatch(user.id, 1, query),
      await revokeOAuthCredentialsForDeletedUserBatch(user.id, 1, query),
    ])
    expect(mutations).toEqual([true, true])
    expect(await getTestOAuthDeletionRows(user.id)).toEqual(before)
    expect(await getTestOAuthDeletionFamilyEvents(user.id)).toEqual([])
  })

  it('checks each residual independently, including expired children beneath revoked parents', async () => {
    const user = await createTestUserDirect({ withEmail: false })
    const owned = await createCredentialChain(user.id, 1)
    await assignTestOAuthClientOwner(owned.client.client_id, user.id)
    await softDeleteUser(user.id)
    await drainCredentials(user.id, 2)
    expect(await hasTestUserDeletionResidual(user.id)).toBe(false)
    const rows = await getTestOAuthDeletionRows(user.id)
    for (const kind of ['client', 'grant', 'family', 'access', 'refresh'] as const) {
      const row = rows.find(candidate => candidate.kind === kind)
      if (!row) throw new Error(`Missing ${kind} fixture`)
      if (kind === 'access' || kind === 'refresh') await expireTestOAuthDeletionChild(kind, row.id)
      await setTestOAuthDeletionRevokedAt(kind, row.id, null)
      expect(await hasTestUserDeletionResidual(user.id)).toBe(true)
      await setTestOAuthDeletionRevokedAt(kind, row.id, row.revoked_at)
      expect(await hasTestUserDeletionResidual(user.id)).toBe(false)
    }
  })

  it('retains a revoked ownerless client and immutable audit after hard user purge', async () => {
    const user = await createTestUserDirect({ withEmail: false })
    const flow = await createCredentialChain(user.id, 0)
    await assignTestOAuthClientOwner(flow.client.client_id, user.id)
    await softDeleteUser(user.id)
    await drainCredentials(user.id, 2)
    const auditCount = await getTestOAuthDeletionAuditCount(user.id)
    expect(auditCount).toBeGreaterThan(0)
    await hardDeleteTestUser(user.id)
    expect(await getTestOAuthClientAfterUserPurge(flow.client.client_id)).toMatchObject({
      owner_user_id: null,
      revoked_at: expect.any(Date),
    })
    expect(await getTestOAuthDeletionAuditCount(user.id)).toBe(auditCount)
  })
})
