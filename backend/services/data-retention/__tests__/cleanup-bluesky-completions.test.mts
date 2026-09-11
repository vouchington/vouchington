import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestExpiryWindow,
  createTestUser,
  deleteTestBlueskyLinkFixtures,
  getTestBlueskyLinkAuthorizationRow,
  getTestBlueskyLinkedAccountRow,
  insertTestBlueskyLinkedAccount,
  insertTestBlueskyLinkCompletion,
  testBlueskyLinkCompletionExists,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'
import {
  cleanupAbandonedBlueskyLinkSessions,
  cleanupExpiredBlueskyLinkCompletions,
  runDataRetentionCleanup,
} from '../cleanup.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('runDataRetentionCleanup', () => {
  it('returns per-cleanup deletion summaries', async () => {
    const now = new Date()
    const emptyWindow = {
      lowerBoundDate: new Date(now.getTime() + DAY_MS),
      maxBatches: 10,
      now,
    }

    const result = await runDataRetentionCleanup({
      softDeletedUsers: emptyWindow,
      oldReferralAttributions: emptyWindow,
      orphanedOAuthAccounts: emptyWindow,
      expiredOAuthAuthorizations: emptyWindow,
      expiredBlueskyLinkCompletions: emptyWindow,
      abandonedBlueskyLinkSessions: emptyWindow,
      expiredContributionAdmissions: emptyWindow,
      expiredContributionQuotaConsumptions: emptyWindow,
      expiredTopicImportAttempts: emptyWindow,
      terminalNotificationPushIntents: emptyWindow,
    })

    expect(result).toEqual({
      softDeletedUsers: { deleted: 0, hasMore: false },
      oldReferralAttributions: { deleted: 0, hasMore: false },
      orphanedOAuthAccounts: { deleted: 0, hasMore: false },
      expiredOAuthAuthorizations: { deleted: 0, hasMore: false },
      expiredBlueskyLinkCompletions: { deleted: 0, hasMore: false },
      abandonedBlueskyLinkSessions: { deleted: 0, hasMore: false },
      expiredContributionAdmissions: { deleted: 0, hasMore: false },
      expiredContributionQuotaConsumptions: { deleted: 0, hasMore: false },
      expiredTopicImportAttempts: { deleted: 0, hasMore: false },
      terminalNotificationPushIntents: { deleted: 0, hasMore: false },
    })
  }, 30_000)
})

describe('cleanupAbandonedBlueskyLinkSessions', () => {
  it('pages only through owned abandoned sessions inside an expiry window', async () => {
    const user = await createTestUser()
    const window = createTestExpiryWindow()
    const authorizationIds = Array.from({ length: 5 }, () => v7())
    onTestFinished(async () => deleteTestBlueskyLinkFixtures({ authorizationIds }))
    const expiries = [
      window.beforeLowerBoundDate,
      window.firstEligibleDate,
      window.secondEligibleDate,
      window.now,
      window.afterUpperBoundDate,
    ]
    const accounts = await Promise.all(
      authorizationIds.map((authorizationId, index) =>
        insertTestBlueskyLinkedAccount({
          userId: null,
          linkingUserId: user.id,
          authorizationId,
          authorizationExpiresAt: expiries[index],
          handle: null,
        }),
      ),
    )

    await expect(
      cleanupAbandonedBlueskyLinkSessions({
        batchSize: 1,
        maxBatches: 1,
        lowerBoundDate: window.lowerBoundDate,
        now: window.now,
      }),
    ).resolves.toEqual({ deleted: 1, hasMore: true })
    expect(await getTestBlueskyLinkedAccountRow(accounts[1]!.bluesky_did)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(accounts[2]!.bluesky_did)).not.toBeNull()

    await expect(
      cleanupAbandonedBlueskyLinkSessions({
        batchSize: 1,
        lowerBoundDate: window.lowerBoundDate,
        now: window.now,
      }),
    ).resolves.toEqual({ deleted: 1, hasMore: false })
    expect(await getTestBlueskyLinkedAccountRow(accounts[0]!.bluesky_did)).not.toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(accounts[2]!.bluesky_did)).toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(accounts[3]!.bluesky_did)).not.toBeNull()
    expect(await getTestBlueskyLinkedAccountRow(accounts[4]!.bluesky_did)).not.toBeNull()
  })
})

describe('cleanupExpiredBlueskyLinkCompletions', () => {
  it('bounds authorization and completion expiry triggers independently', async () => {
    const user = await createTestUser()
    const window = createTestExpiryWindow()
    const authorizationIds = Array.from({ length: 4 }, () => v7())
    onTestFinished(async () => deleteTestBlueskyLinkFixtures({ authorizationIds }))
    const accounts = await Promise.all([
      insertNativePending(user.id, authorizationIds[0]!, window.firstEligibleDate),
      insertNativePending(user.id, authorizationIds[1]!, window.afterUpperBoundDate),
      insertNativePending(user.id, authorizationIds[2]!, window.beforeLowerBoundDate),
      insertNativePending(user.id, authorizationIds[3]!, window.now),
    ])
    await Promise.all([
      insertCompletion(user.id, accounts[0]!, window.afterUpperBoundDate),
      insertCompletion(user.id, accounts[1]!, window.secondEligibleDate),
      insertCompletion(user.id, accounts[2]!, window.afterUpperBoundDate),
      insertCompletion(user.id, accounts[3]!, window.now),
    ])

    await expect(
      cleanupExpiredBlueskyLinkCompletions({
        lowerBoundDate: window.lowerBoundDate,
        now: window.now,
      }),
    ).resolves.toEqual({ deleted: 2, hasMore: false })

    for (const index of [0, 1]) {
      expect(await getTestBlueskyLinkAuthorizationRow(authorizationIds[index]!)).toMatchObject({
        status: 'expired',
        handle: null,
      })
      expect(await getTestBlueskyLinkedAccountRow(accounts[index]!.bluesky_did)).toBeNull()
    }
    for (const index of [2, 3]) {
      expect(await getTestBlueskyLinkAuthorizationRow(authorizationIds[index]!)).toMatchObject({
        status: 'handoff_ready',
      })
      expect(await getTestBlueskyLinkedAccountRow(accounts[index]!.bluesky_did)).not.toBeNull()
    }
  })

  it('deletes only non-handoff completions inside the expiry window', async () => {
    const user = await createTestUser()
    const window = createTestExpiryWindow()
    const authorizationIds = Array.from({ length: 3 }, () => v7())
    onTestFinished(async () => deleteTestBlueskyLinkFixtures({ authorizationIds }))
    const accounts = await Promise.all(
      authorizationIds.map(authorizationId =>
        insertTestBlueskyLinkedAccount({
          userId: null,
          linkingUserId: user.id,
          authorizationId,
          nativeFlowId: authorizationId,
        }),
      ),
    )
    await Promise.all([
      insertCompletion(user.id, accounts[0]!, window.beforeLowerBoundDate, false),
      insertCompletion(user.id, accounts[1]!, window.firstEligibleDate, false),
      insertCompletion(user.id, accounts[2]!, window.now, false),
    ])

    await expect(
      cleanupExpiredBlueskyLinkCompletions({
        lowerBoundDate: window.lowerBoundDate,
        now: window.now,
      }),
    ).resolves.toEqual({ deleted: 1, hasMore: false })
    expect(await testBlueskyLinkCompletionExists(authorizationIds[0]!)).toBe(true)
    expect(await testBlueskyLinkCompletionExists(authorizationIds[1]!)).toBe(false)
    expect(await testBlueskyLinkCompletionExists(authorizationIds[2]!)).toBe(true)
    for (const account of accounts) {
      expect(await getTestBlueskyLinkedAccountRow(account.bluesky_did)).not.toBeNull()
    }
  })
})

async function insertNativePending(userId: string, authorizationId: string, expiresAt: Date) {
  return await insertTestBlueskyLinkedAccount({
    userId: null,
    handle: null,
    linkingUserId: userId,
    authorizationId,
    nativeFlowId: authorizationId,
    authorizationExpiresAt: expiresAt,
  })
}

async function insertCompletion(
  userId: string,
  account: { bluesky_did: string; link_authorization_id: string },
  expiresAt: Date,
  claimOwnership = true,
) {
  await insertTestBlueskyLinkCompletion({
    flowId: account.link_authorization_id,
    userId,
    did: account.bluesky_did,
    expiresAt,
    claimOwnership,
  })
}
