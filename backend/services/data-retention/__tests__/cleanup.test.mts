import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'

import {
  createTestUserDirect,
  softDeleteUserAt,
  getTestUserRaw,
  insertTestOAuthAccount,
  setOAuthAccountCreatedAt,
  oauthAccountExistsByProviderUserId,
  createRandomString,
  createTestRetentionWindow,
  createTestSku,
  hardDeleteTestUser,
  hasTestRetainedIdentityRoot,
  insertTestUserDeletionAudit,
  insertTestRetainedIdentityRoot,
  beginTransaction,
  readTestPublicationIdentityBridge,
  countUserDeletionAuditLogsForTest,
  createTestPost,
  createTestTopic,
  createTestUser,
  deleteTestAdmissionReservation,
  deleteTestRetainedRelationImpact,
  getEntityRelation,
  hasTestRetainedRelationIdentity,
  insertEntityRelation,
  insertTestCommittedAdmissionReservation,
  insertTestRetainedRelationImpact,
} from '@voucha/test-helpers'

import { createUserDeletionRequest } from '@services/user-deletions/create'
import {
  completeUserDeletionForTest,
  getUserDeletionRequestForTest,
} from '@voucha/test-helpers/services/user-deletions/lifecycle.test-support'

import { providerTableConfigs } from '@services/oauth/providers'

import {
  cleanupSoftDeletedUsers,
  cleanupOldReferralAttributions,
  cleanupOrphanedOAuthAccounts,
} from '../cleanup.mts'

import { deleteOrphanedOAuthAccountBatch } from '../cleanup-batches.mts'
import { grantMembership } from '../../memberships/create.mts'
import { cleanupRetainedIdentityRoots } from '../cleanup-retained-identities.mts'
import { cleanupRetainedRelationIdentities } from '../cleanup-retained-relation-identities.mts'
import { retainPublicationIdentityBridges } from '@services/post-publication/identity-bridges'

describe('retained user identity cleanup', () => {
  it('reclaims an unreferenced owner only after its live user is gone', async () => {
    const user = await createTestUserDirect()
    expect(await hasTestRetainedIdentityRoot('user', user.id)).toBe(true)
    await cleanupRetainedIdentityRoots(1_000, { user: [user.id] })
    expect(await hasTestRetainedIdentityRoot('user', user.id)).toBe(true)

    await hardDeleteTestUser(user.id)
    await cleanupRetainedIdentityRoots(1_000, { user: [user.id] })
    expect(await hasTestRetainedIdentityRoot('user', user.id)).toBe(false)
  })

  it('preserves target and requester owners after live deletion while request and audit remain', async () => {
    const target = await createTestUserDirect()
    const requester = await createTestUserDirect()
    const request = await createUserDeletionRequest(target.id, requester.id)
    await insertTestUserDeletionAudit(target.id, requester.id)
    await hardDeleteTestUser(target.id)
    await hardDeleteTestUser(requester.id)

    await cleanupRetainedIdentityRoots(1_000, { user: [target.id, requester.id] })
    expect(request.userId).toBe(target.id)
    expect((await getUserDeletionRequestForTest(request.id))?.userId).toBe(target.id)
    expect(await countUserDeletionAuditLogsForTest(target.id)).toBe(1)
    expect(await hasTestRetainedIdentityRoot('user', target.id)).toBe(true)
    expect(await hasTestRetainedIdentityRoot('user', requester.id)).toBe(true)
  })

  it('keeps recipient and administrator owners while membership lineage rows reference them', async () => {
    const [recipient, administrator] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const sku = await createTestSku({ plan: 'plus' })
    await grantMembership(administrator.id, recipient.id, 'plus', sku.id, 30)
    await hardDeleteTestUser(recipient.id)
    await hardDeleteTestUser(administrator.id)

    await cleanupRetainedIdentityRoots(1_000, { user: [recipient.id, administrator.id] })
    expect(await hasTestRetainedIdentityRoot('user', recipient.id)).toBe(true)
    expect(await hasTestRetainedIdentityRoot('user', administrator.id)).toBe(true)
  })
})

describe('retained publication identity cleanup', () => {
  it('reclaims an orphaned owner left by a conflicting producer', async () => {
    const id = v7()
    await insertTestRetainedIdentityRoot('post', id)
    await cleanupRetainedIdentityRoots(1_000, { post: [id] })
    expect(await hasTestRetainedIdentityRoot('post', id)).toBe(false)
  })

  it('does not delete a root pinned by a concurrent historical bridge capture', async () => {
    const id = v7()
    await insertTestRetainedIdentityRoot('post', id)
    await using capture = await beginTransaction()
    await retainPublicationIdentityBridges(capture, 'post', [id])
    await cleanupRetainedIdentityRoots(1_000, { post: [id] })
    expect(await hasTestRetainedIdentityRoot('post', id)).toBe(true)
    await capture.commit()
    expect(await readTestPublicationIdentityBridge('post', id)).toEqual({ id, live_id: null })
  })

  it('keeps a post root while a committed admission replay references it', async () => {
    const user = await createTestUser()
    const id = v7()
    await insertTestRetainedIdentityRoot('post', id)
    const reservationId = await insertTestCommittedAdmissionReservation({
      actorId: user.id,
      postId: id,
    })
    await cleanupRetainedIdentityRoots(1_000, { post: [id] })
    expect(await hasTestRetainedIdentityRoot('post', id)).toBe(true)

    await deleteTestAdmissionReservation(reservationId)
    await cleanupRetainedIdentityRoots(1_000, { post: [id] })
    expect(await hasTestRetainedIdentityRoot('post', id)).toBe(false)
  })
})

describe('retained elected relation cleanup', () => {
  it('keeps an impact-pinned tuple then reclaims it even while the live relation remains', async () => {
    const creator = await createTestUser()
    const voter = await createTestUser()
    const post = await createTestPost({ user: creator })
    const topic = await createTestTopic({ user: creator })
    const relationTable = 'relation__post__category__topic'
    await insertEntityRelation(relationTable, post.id, topic.id)
    const [relation] = await getEntityRelation(relationTable, post.id, topic.id)
    const relationId = (relation as { id: string }).id
    const request = await createUserDeletionRequest(voter.id, voter.id)
    const impactId = await insertTestRetainedRelationImpact({
      requestId: request.id,
      relationTable,
      subjectId: post.id,
      relationId,
    })

    await cleanupRetainedRelationIdentities(1_000, {
      [relationTable]: [{ subjectId: post.id, relationId }],
    })
    expect(await hasTestRetainedRelationIdentity(relationTable, post.id, relationId)).toBe(true)

    await deleteTestRetainedRelationImpact(impactId)
    await cleanupRetainedRelationIdentities(1_000, {
      [relationTable]: [{ subjectId: post.id, relationId }],
    })
    expect(await hasTestRetainedRelationIdentity(relationTable, post.id, relationId)).toBe(false)
    expect(await getEntityRelation(relationTable, post.id, topic.id)).toHaveLength(1)
  })
})

describe('retention day validation', () => {
  it('rejects unsafe soft-deleted user retention windows', async () => {
    await expect(cleanupSoftDeletedUsers({ retentionDays: 0 })).rejects.toThrow(
      'retentionDays must be a positive integer',
    )
    await expect(cleanupSoftDeletedUsers({ retentionDays: Infinity })).rejects.toThrow(
      'retentionDays must be a finite integer',
    )
  })

  it('rejects unsafe referral attribution retention windows', async () => {
    await expect(cleanupOldReferralAttributions({ retentionDays: 0 })).rejects.toThrow(
      'retentionDays must be a positive integer',
    )
    await expect(cleanupOldReferralAttributions({ retentionDays: Infinity })).rejects.toThrow(
      'retentionDays must be a finite integer',
    )
  })

  it('rejects unsafe OAuth account retention windows', async () => {
    await expect(cleanupOrphanedOAuthAccounts({ retentionDays: 0 })).rejects.toThrow(
      'retentionDays must be a positive integer',
    )
    await expect(cleanupOrphanedOAuthAccounts({ retentionDays: Infinity })).rejects.toThrow(
      'retentionDays must be a finite integer',
    )
  })
})

describe('cleanupSoftDeletedUsers', () => {
  it('hard-deletes soft-deleted users older than retentionDays', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')

    await softDeleteUserAt(user.id, window.firstEligibleDate)

    const result = await cleanupSoftDeletedUsers(window)

    expect(result).toEqual({ deleted: 1, hasMore: false })
    expect(await getTestUserRaw(user.id)).toBeNull()
  }, 30_000)

  it('does NOT delete recently soft-deleted users', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')

    await softDeleteUserAt(user.id, window.afterUpperBoundDate)

    const result = await cleanupSoftDeletedUsers(window)

    expect(result).toEqual({ deleted: 0, hasMore: false })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
  }, 30_000)

  it('keeps a retention-eligible user while its durable deletion request is incomplete', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()

    await createUserDeletionRequest(user.id, user.id)
    await softDeleteUserAt(user.id, window.firstEligibleDate)

    await expect(cleanupSoftDeletedUsers(window)).resolves.toEqual({ deleted: 0, hasMore: false })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
  }, 30_000)

  it('hard-deletes retention-eligible users after durable deletion completion and without a request', async () => {
    const window = createTestRetentionWindow()
    const [completedRequestUser, legacyUser] = await Promise.all([
      createTestUserDirect(),
      createTestUserDirect(),
    ])
    const request = await createUserDeletionRequest(
      completedRequestUser.id,
      completedRequestUser.id,
    )
    await completeUserDeletionForTest(request.id)
    await Promise.all([
      softDeleteUserAt(completedRequestUser.id, window.firstEligibleDate),
      softDeleteUserAt(legacyUser.id, window.secondEligibleDate),
    ])

    await expect(cleanupSoftDeletedUsers(window)).resolves.toEqual({ deleted: 2, hasMore: false })
    await expect(getTestUserRaw(completedRequestUser.id)).resolves.toBeNull()
    await expect(getTestUserRaw(legacyUser.id)).resolves.toBeNull()
  }, 30_000)

  it('rejects invalid batch options', async () => {
    await expect(cleanupSoftDeletedUsers({ batchSize: 0 })).rejects.toThrow(
      'batchSize must be a positive integer',
    )
  })

  it('deletes soft-deleted users in bounded batches and continues on repeat runs', async () => {
    const window = createTestRetentionWindow()
    const firstUser = await createTestUserDirect()
    const secondUser = await createTestUserDirect()
    if (!firstUser || !secondUser) throw new Error('Failed to create test users')

    await softDeleteUserAt(firstUser.id, window.firstEligibleDate)
    await softDeleteUserAt(secondUser.id, window.secondEligibleDate)

    const firstResult = await cleanupSoftDeletedUsers({
      ...window,
      batchSize: 1,
      maxBatches: 1,
    })
    const remainingAfterFirstRun = [
      await getTestUserRaw(firstUser.id),
      await getTestUserRaw(secondUser.id),
    ].filter(Boolean)

    const secondResult = await cleanupSoftDeletedUsers({
      ...window,
      batchSize: 1,
      maxBatches: 1,
    })

    expect(firstResult).toEqual({ deleted: 1, hasMore: true })
    expect(remainingAfterFirstRun).toHaveLength(1)
    expect(secondResult).toEqual({ deleted: 1, hasMore: true })
    expect(await getTestUserRaw(firstUser.id)).toBeNull()
    expect(await getTestUserRaw(secondUser.id)).toBeNull()
  }, 60_000)

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof insertTestOAuthAccount)
  void (0 as unknown as typeof setOAuthAccountCreatedAt)
  void (0 as unknown as typeof oauthAccountExistsByProviderUserId)
  void (0 as unknown as typeof createRandomString)
  void (0 as unknown as typeof providerTableConfigs)
  void (0 as unknown as typeof cleanupOrphanedOAuthAccounts)
  void (0 as unknown as typeof deleteOrphanedOAuthAccountBatch)
})
