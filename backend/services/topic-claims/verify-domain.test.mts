import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestUrlHostname,
  softDeleteTopic,
} from '@voucha/test-helpers'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim, rejectTopicClaim } from './admin-verify.mts'
import { revokeTopicClaim } from './revoke.mts'
import { issueDomainVerificationToken } from './generate-verification-token.mts'
import { verifyTopicClaimDomain } from './verify-domain.mts'
import { TOPIC_CLAIM_DNS_TXT_PREFIX } from './config.mts'
import { getTopicClaimById } from './get.mts'

async function makeClaimWithToken() {
  const staff = await createTestUser({ administrator: true })
  const claimant = await createTestUser()
  const creator = await createTestUser()
  const hostname = `verify-${crypto.randomUUID().slice(0, 8)}.example.com`
  const hostnameId = await insertTestUrlHostname({
    hostname,
  })
  const topicId = await insertTestTopic({
    name: `VD Topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: `vd-topic-${crypto.randomUUID().slice(0, 8)}`,
    createdById: creator.id,
    hostnameId,
  })
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  const tokenResult = await issueDomainVerificationToken(claimant.id, claim.id)
  return { claim, claimant, creator, staff, tokenResult, hostname }
}

describe('verifyTopicClaimDomain', () => {
  const resolveTxtRecords = vi.fn<() => Promise<string[]>>()
  const fetchWellKnownToken = vi.fn<() => Promise<string | null>>()

  function verifyClaim(currentUserId: string, claimId: string) {
    return verifyTopicClaimDomain(currentUserId, claimId, {
      resolveTxtRecords,
      fetchWellKnownToken,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verifies via DNS TXT record match', async () => {
    const { claim, claimant, tokenResult, hostname } = await makeClaimWithToken()
    resolveTxtRecords.mockResolvedValueOnce([tokenResult.rawToken])

    const verified = await verifyClaim(claimant.id, claim.id)

    expect(resolveTxtRecords).toHaveBeenCalledWith(`${TOPIC_CLAIM_DNS_TXT_PREFIX}.${hostname}`)
    expect(verified.verified_at).not.toBeNull()
    expect(verified.verification_method).toBe('dns_txt')
    expect(verified.domain_verified_at).not.toBeNull()
    expect(verified).not.toHaveProperty('verification_token_hash')
    expect(fetchWellKnownToken).not.toHaveBeenCalled()
  })

  it('verifies via well-known file when DNS has no match', async () => {
    const { claim, claimant, tokenResult } = await makeClaimWithToken()
    resolveTxtRecords.mockResolvedValueOnce(['unrelated=record'])
    fetchWellKnownToken.mockResolvedValueOnce(tokenResult.rawToken)

    const verified = await verifyClaim(claimant.id, claim.id)

    expect(verified.verified_at).not.toBeNull()
    expect(verified.verification_method).toBe('well_known_file')
  })

  it('issues a token for a claim created before its topic was merged', async () => {
    const claimant = await createTestUser()
    const creator = await createTestUser()
    const hostnameId = await insertTestUrlHostname({
      hostname: `merged-verify-${crypto.randomUUID().slice(0, 8)}.example.com`,
    })
    const sourceId = await insertTestTopic({
      name: `VD Source Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `vd-source-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
      hostnameId,
    })
    const destinationId = await insertTestTopic({
      name: `VD Destination Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `vd-destination-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId: sourceId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await mergeTopicForTest(sourceId, destinationId, creator.id)

    const tokenResult = await issueDomainVerificationToken(claimant.id, claim.id)

    expect(tokenResult.rawToken).toMatch(/^voucha-site-verification=/)
    expect(tokenResult.dnsInstructions.hostname).toContain('merged-verify-')
  })

  it('throws 422 when neither DNS nor well-known contains the token', async () => {
    const { claim, claimant } = await makeClaimWithToken()
    resolveTxtRecords.mockResolvedValueOnce(['wrong=token'])
    fetchWellKnownToken.mockResolvedValueOnce(null)

    await expect(verifyClaim(claimant.id, claim.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 409 when claim is already verified', async () => {
    const { claim, claimant, staff } = await makeClaimWithToken()
    resolveTxtRecords.mockResolvedValue([])
    fetchWellKnownToken.mockResolvedValue(null)
    await adminVerifyTopicClaim(staff.id, claim.id)

    await expect(verifyClaim(claimant.id, claim.id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('throws 409 when the claim has been rejected', async () => {
    const { claim, claimant, staff } = await makeClaimWithToken()
    await rejectTopicClaim(staff.id, claim.id, 'Insufficient evidence')

    await expect(verifyClaim(claimant.id, claim.id)).rejects.toMatchObject({ status: 409 })
    expect(resolveTxtRecords).not.toHaveBeenCalled()
  })

  it('throws 409 when the claim has been revoked', async () => {
    const { claim, claimant, staff } = await makeClaimWithToken()
    await adminVerifyTopicClaim(staff.id, claim.id)
    await revokeTopicClaim(staff.id, claim.id, 'Ownership ended')

    await expect(verifyClaim(claimant.id, claim.id)).rejects.toMatchObject({ status: 409 })
    expect(resolveTxtRecords).not.toHaveBeenCalled()
  })

  it('throws 409 when the claim is rejected while DNS lookup is in flight', async () => {
    const { claim, claimant, staff, tokenResult } = await makeClaimWithToken()
    resolveTxtRecords.mockImplementationOnce(async () => {
      await rejectTopicClaim(staff.id, claim.id, 'Rejected during verification')
      return [tokenResult.rawToken]
    })

    await expect(verifyClaim(claimant.id, claim.id)).rejects.toMatchObject({ status: 409 })
    const stored = await getTopicClaimById(claim.id)
    expect(stored?.rejected_at).not.toBeNull()
    expect(stored?.verified_at).toBeNull()
  })

  it('throws 404 for a different claimant', async () => {
    const { claim } = await makeClaimWithToken()
    const other = await createTestUser()

    await expect(verifyClaim(other.id, claim.id)).rejects.toMatchObject({ status: 404 })
    await expect(issueDomainVerificationToken(other.id, claim.id)).rejects.toMatchObject({
      status: 404,
    })
  })

  it('throws 404 when the topic was soft-deleted', async () => {
    const { claim, claimant, creator } = await makeClaimWithToken()
    await softDeleteTopic(claim.topic_id, creator.id)

    await expect(verifyClaim(claimant.id, claim.id)).rejects.toMatchObject({ status: 404 })
  })

  it('throws 404 when the claim topic was merged into a deleted destination', async () => {
    const { claim, claimant, creator } = await makeClaimWithToken()
    const destinationId = await insertTestTopic({
      name: `VD Deleted Destination ${crypto.randomUUID().slice(0, 8)}`,
      slug: `vd-deleted-destination-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    await mergeTopicForTest(claim.topic_id, destinationId, creator.id)
    await softDeleteTopic(destinationId, creator.id)

    await expect(verifyClaim(claimant.id, claim.id)).rejects.toMatchObject({ status: 404 })
  })

  it('still verifies a claim whose topic was merged into an active destination', async () => {
    const { claim, claimant, creator, tokenResult } = await makeClaimWithToken()
    const destinationId = await insertTestTopic({
      name: `VD Active Destination ${crypto.randomUUID().slice(0, 8)}`,
      slug: `vd-active-destination-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    await mergeTopicForTest(claim.topic_id, destinationId, creator.id)
    resolveTxtRecords.mockResolvedValueOnce([tokenResult.rawToken])

    const verified = await verifyClaim(claimant.id, claim.id)

    expect(verified.verification_method).toBe('dns_txt')
  })
})
