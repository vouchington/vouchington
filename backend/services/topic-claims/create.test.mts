import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  insertTestTopic,
  insertTestUrlHostname,
  setTestTopicHostnameLink,
} from '@voucha/test-helpers'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim, rejectTopicClaim } from './admin-verify.mts'
import { submitTopicClaimForManualReview } from './submit-for-manual-review.mts'
import { requireTopicClaimOnTopic } from './require-on-topic.mts'

describe('createTopicClaim', () => {
  let claimant: PrivateUser
  let topicId: string

  beforeAll(async () => {
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `TC Create Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `tc-create-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
  })

  it('creates a new claim and returns isDuplicate false', async () => {
    const { claim, isDuplicate } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Card issuer',
      evidence: 'We are the company behind this topic.',
    })

    expect(isDuplicate).toBe(false)
    expect(claim.topic_id).toBe(topicId)
    expect(claim.claimant_user_id).toBe(claimant.id)
    expect(claim.claimed_role).toBe('Card issuer')
    expect(claim.verified_at).toBeNull()
    expect(claim.rejected_at).toBeNull()
    expect(claim).not.toHaveProperty('verification_token_hash')
  })

  it('creates a claim by topic slug without casting the slug to UUID', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const slug = `tc-slug-${crypto.randomUUID().slice(0, 8)}`
    const tid = await insertTestTopic({
      name: `TC Slug Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug,
      createdById: creator.id,
    })

    const { claim } = await createTopicClaim(user.id, {
      topicId: slug,
      claimedRole: 'Operator',
      evidence: '',
    })

    expect(claim.topic_id).toBe(tid)
  })

  it('snapshots the topic hostname for domain verification', async () => {
    const user = await createTestUser()
    const hostname = `tc-claim-${crypto.randomUUID()}.example.com`
    const topic = await createTestTopic({ user, hostname })

    const { claim } = await createTopicClaim(user.id, {
      topicId: topic.id,
      claimedRole: 'Operator',
      evidence: '',
    })

    expect(claim.verification_hostname_id).not.toBeNull()
  })

  it('resolves merged source topic IDs to the destination claim topic', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const sourceId = await insertTestTopic({
      name: `TC Source Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `tc-source-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const destinationId = await insertTestTopic({
      name: `TC Destination Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `tc-destination-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const sourceHostnameId = await insertTestUrlHostname({
      hostname: `tc-source-${crypto.randomUUID()}.example.com`,
    })
    const destinationHostnameId = await insertTestUrlHostname({
      hostname: `tc-destination-${crypto.randomUUID()}.example.com`,
    })
    await setTestTopicHostnameLink(sourceId, sourceHostnameId)
    await setTestTopicHostnameLink(destinationId, destinationHostnameId)
    await mergeTopicForTest(sourceId, destinationId, creator.id)

    const { claim } = await createTopicClaim(user.id, {
      topicId: sourceId,
      claimedRole: 'Operator',
      evidence: '',
    })

    expect(claim.topic_id).toBe(destinationId)
    expect(claim.verification_hostname_id).toBe(destinationHostnameId)
    expect(claim.verification_hostname_id).not.toBe(sourceHostnameId)
  })

  it('returns isDuplicate true and updates on duplicate submission', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `TC Dup Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `tc-dup-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })

    await createTopicClaim(user.id, { topicId: tid, claimedRole: 'Operator', evidence: '' })
    const { claim, isDuplicate } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Program operator',
      evidence: 'Updated evidence',
    })

    expect(isDuplicate).toBe(true)
    expect(claim.claimed_role).toBe('Program operator')
    expect(claim.evidence).toBe('Updated evidence')
  })

  it('returns the verified claim unchanged', async () => {
    const user = await createTestUser()
    const staff = await createTestUser({ administrator: true })
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `TC Verified Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `tc-verified-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim: created } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: 'Original evidence',
    })
    await adminVerifyTopicClaim(staff.id, created.id)

    const { claim, isDuplicate } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Different role',
      evidence: 'Replaced evidence',
    })

    expect(isDuplicate).toBe(true)
    expect(claim.id).toBe(created.id)
    expect(claim.claimed_role).toBe('Issuer')
    expect(claim.evidence).toBe('Original evidence')
    expect(claim.verified_at).not.toBeNull()
  })

  it('returns a submitted claim unchanged', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `TC Submitted Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `tc-submitted-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim: created } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: 'Original evidence',
    })
    await submitTopicClaimForManualReview(
      user.id,
      await requireTopicClaimOnTopic(tid, created.id),
      'Review evidence',
    )

    const { claim, isDuplicate } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Different role',
      evidence: 'Replaced evidence',
    })

    expect(isDuplicate).toBe(true)
    expect(claim.id).toBe(created.id)
    expect(claim.claimed_role).toBe('Issuer')
    expect(claim.evidence).toBe('Review evidence')
    expect(claim.submitted_at).not.toBeNull()
    expect(claim.verified_at).toBeNull()
  })

  it('allows a new claim after previous claim was rejected', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `TC Rejected Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `tc-rejected-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })

    const { claim: first } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })
    // Reject via service layer (no direct DB access in tests)
    const staffUser = await createTestUser({ administrator: true })
    await rejectTopicClaim(staffUser.id, first.id, 'Insufficient evidence')

    const { claim: second, isDuplicate } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: 'New evidence',
    })

    expect(isDuplicate).toBe(false)
    expect(second.id).not.toBe(first.id)
  })

  it('returns 404 for non-existent topic', async () => {
    await expect(
      createTopicClaim(claimant.id, {
        topicId: crypto.randomUUID(),
        claimedRole: 'Issuer',
        evidence: '',
      }),
    ).rejects.toMatchObject({ status: 404 })
  })
})
