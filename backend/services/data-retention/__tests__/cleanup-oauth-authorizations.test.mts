import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { cleanupExpiredOAuthAuthorizations } from '../cleanup.mts'
import { createTestUser } from '@voucha/test-helpers'
import { upsertOAuthAccount } from '@services/oauth-accounts'
import { deleteTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'

describe('cleanupExpiredOAuthAuthorizations', () => {
  it('deletes only expired rows across pages and keeps unexpired rows', async () => {
    const authorizationIds = Array.from({ length: 4 }, () => v7())
    const [oldestExpiredId, newestExpiredId, unexpiredId, unscopedExpiredId] = authorizationIds
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds })
    })
    const now = Date.now()
    await Promise.all([
      insertTestOAuthAuthorization({
        id: oldestExpiredId,
        expiresAt: new Date(now - 120_000),
      }),
      insertTestOAuthAuthorization({
        id: newestExpiredId,
        expiresAt: new Date(now - 60_000),
      }),
      insertTestOAuthAuthorization({ id: unexpiredId, expiresAt: new Date(now + 3_600_000) }),
      insertTestOAuthAuthorization({
        id: unscopedExpiredId,
        expiresAt: new Date(now - 90_000),
      }),
    ])
    const scopedIds = authorizationIds.slice(0, 3)

    await expect(
      cleanupExpiredOAuthAuthorizations({
        batchSize: 1,
        maxBatches: 1,
        authorizationIds: scopedIds,
      }),
    ).resolves.toEqual({ deleted: 1, hasMore: true })
    await expect(getTestOAuthAuthorization(oldestExpiredId)).resolves.toBeNull()
    await expect(getTestOAuthAuthorization(newestExpiredId)).resolves.not.toBeNull()

    await expect(
      cleanupExpiredOAuthAuthorizations({
        batchSize: 10,
        maxBatches: 2,
        authorizationIds: scopedIds,
      }),
    ).resolves.toEqual({ deleted: 1, hasMore: false })
    await expect(getTestOAuthAuthorization(newestExpiredId)).resolves.toBeNull()
    await expect(getTestOAuthAuthorization(unexpiredId)).resolves.not.toBeNull()
    await expect(getTestOAuthAuthorization(unscopedExpiredId)).resolves.not.toBeNull()
  })

  it('cascades ephemeral completed state before provider-account retention', async () => {
    const user = await createTestUser()
    const providerUserId = `retention-broker-${randomUUID()}`
    const authorizationId = v7()
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds: [authorizationId] })
      await deleteTestOAuthAccount('github', providerUserId)
    })
    await upsertOAuthAccount('github', providerUserId, null, { login: providerUserId })
    const now = new Date()
    await insertTestOAuthAuthorization({
      id: authorizationId,
      status: 'completed',
      completionToken: randomUUID(),
      providerUserId,
      resultKind: 'authenticated',
      resultUserId: user.id,
      callbackReceivedAt: now,
      completionReadyAt: now,
      completedAt: now,
      expiresAt: new Date(Date.now() - 60_000),
    })
    await deleteTestOAuthAccount('github', providerUserId)

    await expect(getTestOAuthAuthorization(authorizationId)).resolves.toBeNull()
  })
})
