import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim } from './admin-verify.mts'
import {
  getTopicClaimById,
  getVerifiedTopicClaim,
  listTopicClaimsForTopic,
  listTopicClaimsForUser,
  listPendingTopicClaims,
} from './get.mts'

describe('getTopicClaimById', () => {
  let claimant: PrivateUser
  let topicId: string

  beforeAll(async () => {
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `GetById Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `getbyid-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
  })

  it('returns a claim by id', async () => {
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    const found = await getTopicClaimById(claim.id)
    expect(found).not.toBeNull()
    expect(found!.id).toBe(claim.id)
    expect(found!.topic_id).toBe(topicId)
    expect(found).not.toHaveProperty('verification_token_hash')
  })

  it('returns null for unknown id', async () => {
    const result = await getTopicClaimById(crypto.randomUUID())
    expect(result).toBeNull()
  })
})

describe('getVerifiedTopicClaim', () => {
  let staff: PrivateUser
  let claimant: PrivateUser
  let topicId: string

  beforeAll(async () => {
    staff = await createTestUser()
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `GetVerified Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `getverified-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
  })

  it('returns null when no verified claim exists', async () => {
    const other = await createTestUser()
    const result = await getVerifiedTopicClaim(topicId, other.id)
    expect(result).toBeNull()
  })

  it('returns null for a pending (unverified) claim', async () => {
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    // Not verified yet
    const result = await getVerifiedTopicClaim(topicId, claimant.id)
    // The claim exists but is not verified, so result should be null
    expect(result).toBeNull()
    // Confirm the claim id exists
    expect(claim.id).toBeTruthy()
  })

  it('returns the verified claim', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `Verified Claim Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `verified-claim-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)

    const result = await getVerifiedTopicClaim(tid, user.id)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(claim.id)
    expect(result!.verified_at).not.toBeNull()
  })
})

describe('listTopicClaimsForTopic', () => {
  it('returns all claims for a topic including different users', async () => {
    const creator = await createTestUser()
    const topicId = await insertTestTopic({
      name: `ListForTopic Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `listfortopic-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const u1 = await createTestUser()
    const u2 = await createTestUser()
    await createTopicClaim(u1.id, { topicId, claimedRole: 'Issuer', evidence: '' })
    await createTopicClaim(u2.id, { topicId, claimedRole: 'Operator', evidence: '' })

    const claims = await listTopicClaimsForTopic(topicId)
    expect(claims.length).toBeGreaterThanOrEqual(2)
    const userIds = claims.map(c => c.claimant_user_id)
    expect(userIds).toContain(u1.id)
    expect(userIds).toContain(u2.id)
  })

  it('returns empty for topic with no claims', async () => {
    const creator = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Empty Claims Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `empty-claims-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const claims = await listTopicClaimsForTopic(topicId)
    expect(claims).toEqual([])
  })
})

describe('listTopicClaimsForUser', () => {
  it('returns claims for a user across multiple topics', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const t1 = await insertTestTopic({
      name: `User Claims T1 ${crypto.randomUUID().slice(0, 8)}`,
      slug: `user-claims-t1-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const t2 = await insertTestTopic({
      name: `User Claims T2 ${crypto.randomUUID().slice(0, 8)}`,
      slug: `user-claims-t2-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    await createTopicClaim(user.id, { topicId: t1, claimedRole: 'Issuer', evidence: '' })
    await createTopicClaim(user.id, { topicId: t2, claimedRole: 'Operator', evidence: '' })

    const claims = await listTopicClaimsForUser(user.id)
    expect(claims.length).toBeGreaterThanOrEqual(2)
    for (const c of claims) {
      expect(c.claimant_user_id).toBe(user.id)
    }
  })

  it('returns empty list for user with no claims', async () => {
    const user = await createTestUser()
    const claims = await listTopicClaimsForUser(user.id)
    expect(claims).toEqual([])
  })
})

describe('listPendingTopicClaims', () => {
  let staff: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
  })

  it('returns only submitted-but-unresolved claims', async () => {
    const creator = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Pending Claims Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `pending-claims-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    // User submits a claim (initially no submitted_at)
    const u = await createTestUser()
    await createTopicClaim(u.id, { topicId, claimedRole: 'Issuer', evidence: 'Proof' })

    // listPendingTopicClaims only shows submitted (submitted_at IS NOT NULL) and unresolved
    // Our freshly created claim has no submitted_at, so it won't appear yet
    const pending = await listPendingTopicClaims()
    // Verify the function runs without error and returns an array
    expect(Array.isArray(pending)).toBe(true)
    for (const c of pending) {
      expect(c.submitted_at).not.toBeNull()
      expect(c.verified_at).toBeNull()
      expect(c.rejected_at).toBeNull()
    }
  })

  it('does not include verified claims in pending list', async () => {
    const creator = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Pending Excl Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `pending-excl-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const u = await createTestUser()
    const { claim } = await createTopicClaim(u.id, { topicId, claimedRole: 'Issuer', evidence: '' })
    await adminVerifyTopicClaim(staff.id, claim.id)

    const pending = await listPendingTopicClaims()
    const found = pending.find(c => c.id === claim.id)
    expect(found).toBeUndefined()
  })
})
