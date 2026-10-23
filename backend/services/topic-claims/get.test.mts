import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim } from './admin-verify.mts'
import {
  getVerifiedTopicClaim,
  listTopicClaimsForTopic,
  listTopicClaimsForUser,
  listPendingTopicClaims,
} from './get.mts'

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
  it('paginates and scopes a cursor to the claimant filter', async () => {
    const owner = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Claim page ${crypto.randomUUID().slice(0, 8)}`,
      slug: `claim-page-${crypto.randomUUID().slice(0, 8)}`,
      createdById: owner.id,
    })
    const claimants = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    for (const claimant of claimants) {
      await createTopicClaim(claimant.id, { topicId, claimedRole: 'Issuer', evidence: '' })
    }
    const first = await listTopicClaimsForTopic(topicId, { limit: 1 })
    expect(first.results).toHaveLength(1)
    expect(first.page_info.has_next_page).toBe(true)
    const second = await listTopicClaimsForTopic(topicId, {
      limit: 1,
      after: first.page_info.end_cursor!,
    })
    expect(second.results).toHaveLength(1)
    expect(second.results[0]!.id).not.toBe(first.results[0]!.id)
    await expect(
      listTopicClaimsForTopic(topicId, {
        limit: 1,
        claimantUserId: claimants[0]!.id,
        after: first.page_info.end_cursor!,
      }),
    ).rejects.toThrow('Invalid claim cursor')
    const own = await listTopicClaimsForTopic(topicId, {
      limit: 1,
      claimantUserId: claimants[0]!.id,
    })
    expect(own.results.map(claim => claim.claimant_user_id)).toEqual([claimants[0]!.id])
    expect(own.page_info.has_next_page).toBe(false)
  })

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

    const { results } = await listTopicClaimsForTopic(topicId)
    expect(results.length).toBeGreaterThanOrEqual(2)
    const userIds = results.map(c => c.claimant_user_id)
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
    const page = await listTopicClaimsForTopic(topicId)
    expect(page.results).toEqual([])
  })
})

describe('listTopicClaimsForUser', () => {
  it('binds topic filters to the cursor', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const topicIds = await Promise.all(
      [0, 1].map(index =>
        insertTestTopic({
          name: `User claim filter ${index} ${crypto.randomUUID().slice(0, 8)}`,
          slug: `user-claim-filter-${index}-${crypto.randomUUID().slice(0, 8)}`,
          createdById: creator.id,
        }),
      ),
    )
    for (const topicId of topicIds)
      await createTopicClaim(user.id, { topicId, claimedRole: 'Issuer', evidence: '' })
    const first = await listTopicClaimsForUser(user.id, { limit: 1, topicIds })
    expect(first.page_info.has_next_page).toBe(true)
    const second = await listTopicClaimsForUser(user.id, {
      limit: 1,
      topicIds,
      after: first.page_info.end_cursor!,
    })
    expect(second.results[0]!.id).not.toBe(first.results[0]!.id)
    await expect(
      listTopicClaimsForUser(user.id, {
        limit: 1,
        topicIds: [topicIds[0]!],
        after: first.page_info.end_cursor!,
      }),
    ).rejects.toThrow('Invalid claim cursor')
  })

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

    const { results } = await listTopicClaimsForUser(user.id)
    expect(results.length).toBeGreaterThanOrEqual(2)
    for (const c of results) {
      expect(c.claimant_user_id).toBe(user.id)
    }
  })

  it('returns empty list for user with no claims', async () => {
    const user = await createTestUser()
    const page = await listTopicClaimsForUser(user.id)
    expect(page.results).toEqual([])
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
