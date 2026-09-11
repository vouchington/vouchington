import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { cleanupExpiredOAuthAuthorizations } from '../cleanup.mts'
import { createTestExpiryWindow, createTestUser } from '@voucha/test-helpers'
import { upsertOAuthAccount } from '@services/oauth-accounts'
import { deleteTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'
import {
  deleteTestOAuthAuthorizationFixtures,
  getTestOAuthAuthorization,
  insertTestOAuthAuthorization,
} from '@voucha/test-helpers/entities/oauth-authorizations'

describe('cleanupExpiredOAuthAuthorizations', () => {
  it('deletes only its bounded expiry window across pages', async () => {
    const window = createTestExpiryWindow()
    const authorizationIds = Array.from({ length: 4 }, () => v7())
    onTestFinished(async () => {
      await deleteTestOAuthAuthorizationFixtures({ authorizationIds })
    })
    await Promise.all([
      insertTestOAuthAuthorization({
        id: authorizationIds[0],
        expiresAt: window.beforeLowerBoundDate,
      }),
      insertTestOAuthAuthorization({
        id: authorizationIds[1],
        expiresAt: window.firstEligibleDate,
      }),
      insertTestOAuthAuthorization({ id: authorizationIds[2], expiresAt: window.now }),
      insertTestOAuthAuthorization({
        id: authorizationIds[3],
        expiresAt: window.afterUpperBoundDate,
      }),
    ])

    await expect(
      cleanupExpiredOAuthAuthorizations({
        batchSize: 1,
        lowerBoundDate: window.lowerBoundDate,
        maxBatches: 1,
        now: window.now,
      }),
    ).resolves.toEqual({ deleted: 1, hasMore: true })
    await expect(
      cleanupExpiredOAuthAuthorizations({
        batchSize: 10,
        lowerBoundDate: window.lowerBoundDate,
        now: window.now,
      }),
    ).resolves.toEqual({ deleted: 1, hasMore: false })

    await expect(getTestOAuthAuthorization(authorizationIds[0])).resolves.not.toBeNull()
    await expect(getTestOAuthAuthorization(authorizationIds[1])).resolves.toBeNull()
    await expect(getTestOAuthAuthorization(authorizationIds[2])).resolves.toBeNull()
    await expect(getTestOAuthAuthorization(authorizationIds[3])).resolves.not.toBeNull()
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
