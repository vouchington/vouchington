import { describe, it, expect, beforeAll } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim, rejectTopicClaim } from './admin-verify.mts'
import { revokeTopicClaim } from './revoke.mts'

describe('adminVerifyTopicClaim', () => {
  let staffUser: PrivateUser
  let claimant: PrivateUser
  let topicId: string

  beforeAll(async () => {
    staffUser = await createTestUser()
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `AdminVerify Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `admin-verify-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
  })

  it('verifies a pending claim and sets verification_method to manual_admin', async () => {
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: 'proof',
    })

    const verified = await adminVerifyTopicClaim(staffUser.id, claim.id)

    expect(verified.verified_at).not.toBeNull()
    expect(verified.verified_by_id).toBe(staffUser.id)
    expect(verified.verification_method).toBe('manual_admin')
  })

  it('throws 404 if claim is already verified', async () => {
    const user = await createTestUser()
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `AV Already ${crypto.randomUUID().slice(0, 8)}`,
      slug: `av-already-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(user.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staffUser.id, claim.id)

    await expect(adminVerifyTopicClaim(staffUser.id, claim.id)).rejects.toMatchObject({
      status: 404,
    })
  })
})

describe('rejectTopicClaim', () => {
  let staffUser: PrivateUser
  let claimant: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser()
    claimant = await createTestUser()
  })

  it('rejects a pending claim with a reason', async () => {
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `Reject Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `reject-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })

    const rejected = await rejectTopicClaim(staffUser.id, claim.id, 'Insufficient evidence')

    expect(rejected.rejected_at).not.toBeNull()
    expect(rejected.rejected_by_id).toBe(staffUser.id)
    expect(rejected.rejection_reason).toBe('Insufficient evidence')
  })

  it('throws 422 when rejection_reason is empty', async () => {
    await expect(rejectTopicClaim(staffUser.id, crypto.randomUUID(), '')).rejects.toMatchObject({
      status: 422,
    })
  })
})

describe('revokeTopicClaim', () => {
  let staffUser: PrivateUser
  let claimant: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser()
    claimant = await createTestUser()
  })

  it('revokes a verified claim', async () => {
    const creator = await createTestUser()
    const tid = await insertTestTopic({
      name: `Revoke Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `revoke-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId: tid,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staffUser.id, claim.id)

    const revoked = await revokeTopicClaim(staffUser.id, claim.id, 'Ownership transferred')

    expect(revoked.revoked_at).not.toBeNull()
    expect(revoked.revoked_by_id).toBe(staffUser.id)
    expect(revoked.revocation_reason).toBe('Ownership transferred')
  })

  it('throws 404 when claim is not verified', async () => {
    await expect(
      revokeTopicClaim(staffUser.id, crypto.randomUUID(), 'reason'),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('throws 422 when revocation_reason is empty', async () => {
    await expect(revokeTopicClaim(staffUser.id, crypto.randomUUID(), '')).rejects.toMatchObject({
      status: 422,
    })
  })
})
