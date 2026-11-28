import { randomInt } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getMinUuidv7ForDate } from '@modules/utils'
import { beginTransaction, createTestUser } from '@voucha/test-helpers'
import {
  insertTestAccountCopyrightRationale,
  readTestCopyrightDecisionRationales,
} from '@voucha/test-helpers/copyright-mcp-audit'
import { withCommittedPostgresTransactionForTest } from '@voucha/test-helpers/postgres-transaction'
import { runRetentionWithPendingHoldForTest } from '@voucha/test-helpers/preservation-hold-retention-race'
import { withTestRationaleRetentionPosition } from '@voucha/test-helpers/security-retention'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import {
  createTestPendingOAuthAuthorization,
  issueTestOAuthTokensForClient,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import {
  getTestOAuthRetentionRowCounts,
  prepareTestOAuthRetentionRows,
} from '@voucha/test-helpers/entities/oauth-retention'
import {
  createConcurrentTestFirstOAuthGrants,
  deleteTestNativeMintAudit,
  deleteTestNativeMintAuditForRetention,
  insertTestNativeMintAudit,
  testNativeMintAuditExists,
} from '@voucha/test-helpers/entities/oauth-retention-evidence'
import {
  createTestMicrosecondRevokedGrantPage,
  testOAuthGrantExists,
  testSecurityRetentionCursorAt,
} from '@voucha/test-helpers/entities/oauth-retention-microsecond-page'
import {
  countTestOAuthGrantChildArtifacts,
  deleteTestOAuthClientWithPredicate,
  deleteTestOAuthGrantWithPredicate,
  drainTestOAuthAuthorizationRequestsForClient,
  insertTestRevokedOAuthGrantWithYoungArtifacts,
  lockTestNeverGrantedOAuthClient,
  lockTestOAuthGrantForUpdate,
} from '@voucha/test-helpers/entities/oauth-retention-cascade-fixtures'
import {
  insertPreservationHoldForTest,
  readPreservationHoldsForTest,
  releasePreservationHoldForTest,
} from '@voucha/test-helpers/entities/user-legal-preservation-holds'
import { cleanupSecurityRecords } from './cleanup-security-records.mts'
import { cleanupSecuritySourcePageInTransaction } from './security-record-page.mts'
import { SOURCES, sourcePlan } from './security-record-plans.mts'

describe('security record cleanup', () => {
  it('records concurrent first grants without upgrading shared client locks', async () => {
    const firstUser = await createTestUser()
    const secondUser = await createTestUser()
    const pending = await createTestPendingOAuthAuthorization(firstUser)
    expect(
      await createConcurrentTestFirstOAuthGrants(pending.client.client_id, [
        firstUser.id,
        secondUser.id,
      ]),
    ).toEqual({ grantCount: 2, markerCount: 1 })
  })

  it('advances beyond a retained microsecond-keyed grant to the next eligible row', async () => {
    const user = await createTestUser()
    const pending = await createTestPendingOAuthAuthorization(user)
    const blockedRevokedAt = '1970-03-01T00:00:00.123400Z'
    await using query = await beginTransaction()
    const { blockedId, deletableId } = await createTestMicrosecondRevokedGrantPage(query, {
      userId: user.id,
      clientId: pending.client.client_id,
      blockedRevokedAt,
      deletableRevokedAt: '1970-03-01T00:00:00.123900Z',
    })
    const now = new Date('1970-06-01T00:00:00Z')
    expect(await cleanupSecuritySourcePageInTransaction(query, 'oauth_grants', 1, now)).toEqual({
      deleted: 0,
      hasMore: true,
    })
    expect(await testSecurityRetentionCursorAt(query, blockedRevokedAt)).toBe(true)
    expect(await cleanupSecuritySourcePageInTransaction(query, 'oauth_grants', 1, now)).toEqual({
      deleted: 1,
      hasMore: false,
    })
    expect(await testOAuthGrantExists(query, blockedId)).toBe(true)
    expect(await testOAuthGrantExists(query, deletableId)).toBe(false)
    // The transaction rolls back both fixture rows and its temporary cursor position.
  })

  it('does not cascade a never-granted client into pending consent requests', async () => {
    const user = await createTestUser()
    const pending = await createTestPendingOAuthAuthorization(user, {
      ageNeverGrantedClient: true,
    })
    await prepareTestOAuthRetentionRows(pending.client.client_id, {
      expiresAt: new Date(Date.now() + 86_400_000),
      extraRequests: 2,
      only: 'requests',
    })
    await using query = await beginTransaction()
    const plan = sourcePlan('oauth_clients', new Date())
    const cutoffId = getMinUuidv7ForDate(plan.cutoffAt)
    const client = await lockTestNeverGrantedOAuthClient(query, pending.client.client_id, cutoffId)
    expect(client?.never_granted).toBe(true)
    expect(client?.aged).toBe(true)
    expect(
      await deleteTestOAuthClientWithPredicate(query, client!.id, cutoffId, plan.deletePredicate!),
    ).toBe(0)
    expect((await getTestOAuthRetentionRowCounts(pending.client.client_id)).requests).toBe(3)
    // The existing OAuth artifact worker retires expired requests in capped pages. Once that
    // child family is drained, the same otherwise eligible client may be removed.
    expect(await drainTestOAuthAuthorizationRequestsForClient(query, client!.id)).toBe(3)
    expect(
      await deleteTestOAuthClientWithPredicate(query, client!.id, cutoffId, plan.deletePredicate!),
    ).toBe(1)
  })

  it('keeps noncase rationale ciphertext when a hold commits before erasure commits', async () => {
    const [admin, subject, unheld] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const earlierAt = new Date(Date.UTC(1974, 0, 1) + randomInt(365 * 86_400_000))
    const heldAt = new Date(earlierAt.getTime() + 1)
    const now = new Date(heldAt.getTime() + 1)
    now.setUTCFullYear(now.getUTCFullYear() + 6)
    const [unheldId, rationaleId] = await Promise.all([
      insertTestAccountCopyrightRationale(unheld.id, admin.id, earlierAt),
      insertTestAccountCopyrightRationale(subject.id, admin.id, heldAt),
    ])
    const before = await readTestCopyrightDecisionRationales(admin.id)
    expect(before.map(row => row.id)).toEqual([unheldId, rationaleId])
    const ciphertext = before[1]!.rationale_ciphertext

    const hold = await runRetentionWithPendingHoldForTest(
      admin,
      subject.id,
      'deleteSecurityRetentionPage:copyright_rationales_attempts',
      rationaleId,
      () =>
        withCommittedPostgresTransactionForTest(query =>
          withTestRationaleRetentionPosition(query, getMinUuidv7ForDate(earlierAt), () =>
            cleanupSecuritySourcePageInTransaction(query, 'copyright_rationales_attempts', 2, now),
          ),
        ),
    )
    expect(await readPreservationHoldsForTest(subject.id)).toEqual([
      expect.objectContaining({ id: hold.id, released_at: null }),
    ])
    const after = await readTestCopyrightDecisionRationales(admin.id)
    expect(after.map(row => row.id)).not.toContain(unheldId)
    const heldCiphertextPreserved =
      after.find(row => row.id === rationaleId)?.rationale_ciphertext === ciphertext
    expect(heldCiphertextPreserved).toBe(true)
  })

  it('does not cascade a revoked grant into younger authorization artifacts', async () => {
    const user = await createTestUser()
    const { clientId } = await issueTestOAuthTokensForClient(user, {
      audience: 'user',
      scope: 'mcp.user:read',
    })
    const now = new Date()
    const futureExpiry = new Date(now.getTime() + 30 * 86_400_000)
    const revokedAt = new Date(now.getTime() - 120 * 86_400_000)
    await using query = await beginTransaction()
    const { grantId, familyId } = await insertTestRevokedOAuthGrantWithYoungArtifacts(query, {
      userId: user.id,
      clientId,
      revokedAt,
      futureExpiry,
    })
    await lockTestOAuthGrantForUpdate(query, grantId)
    const plan = sourcePlan('oauth_grants', now)
    expect(await deleteTestOAuthGrantWithPredicate(query, grantId, plan.deletePredicate!)).toBe(0)
    expect(await countTestOAuthGrantChildArtifacts(query, grantId, familyId)).toBe(4)
    // The transaction intentionally rolls back its synthetic young artifacts.
  })

  it('retires aged native mint audit only after its account hold is released', async () => {
    const now = new Date()
    const cutoff = sourcePlan('oauth_native_mints', now).cutoffAt
    const user = await createTestUserDirect()
    const oldMintId = await insertTestNativeMintAudit(
      user.id,
      new Date(now.getTime() - 730 * 86_400_000),
    )
    const recentMintId = await insertTestNativeMintAudit(
      user.id,
      new Date(now.getTime() - 10 * 86_400_000),
    )
    const holdId = await insertPreservationHoldForTest(user.id, user.id)

    await expect(deleteTestNativeMintAudit(recentMintId)).rejects.toThrow(
      'oauth_native_session_token_mints rows are append-only',
    )
    await expect(deleteTestNativeMintAuditForRetention(oldMintId, cutoff)).rejects.toThrow(
      'oauth_native_session_token_mints rows are append-only',
    )
    expect(await testNativeMintAuditExists(oldMintId)).toBe(true)

    await releasePreservationHoldForTest(holdId, user.id)
    await deleteTestNativeMintAuditForRetention(oldMintId, cutoff)
    await expect(deleteTestNativeMintAuditForRetention(recentMintId, cutoff)).rejects.toThrow(
      'oauth_native_session_token_mints rows are append-only',
    )
    expect(await testNativeMintAuditExists(oldMintId)).toBe(false)
    expect(await testNativeMintAuditExists(recentMintId)).toBe(true)
  })

  it('prepares a bounded page for every source with its own typed cursor', async () => {
    // This cutoff predates synthetic records; the query checks every source without deleting
    // fixtures owned by another parallel test.
    const now = new Date('1977-01-02T00:00:00.000Z')
    const pages = await Promise.all(
      SOURCES.map(source => cleanupSecurityRecords({ batchSize: 1, maxBatches: 1 }, now, [source])),
    )
    expect(pages).toEqual(SOURCES.map(() => ({ deleted: 0, hasMore: false })))
  })
})
