import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestUser, insertTestTopic, insertTestUrlHostname } from '@voucha/test-helpers'
import { mergeTopicForTest } from '@voucha/test-helpers/entities/topics'
import { createTopicClaim } from './create.mts'
import { adminVerifyTopicClaim } from './admin-verify.mts'
import { issueDomainVerificationToken } from './generate-verification-token.mts'
import { verifyTopicClaimDomain } from './verify-domain.mts'

async function makeClaimWithToken() {
  const staff = await createTestUser({ administrator: true })
  const claimant = await createTestUser()
  const creator = await createTestUser()
  const hostnameId = await insertTestUrlHostname({
    hostname: `verify-${crypto.randomUUID().slice(0, 8)}.example.com`,
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
  return { claim, claimant, staff, tokenResult }
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
    const { claim, claimant, tokenResult } = await makeClaimWithToken()
    resolveTxtRecords.mockResolvedValueOnce([tokenResult.rawToken])

    const verified = await verifyClaim(claimant.id, claim.id)

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
})
