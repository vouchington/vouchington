import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestTopic, insertTestUrlHostname } from '@voucha/test-helpers'
import { createTopicClaim } from '@services/topic-claims/create'
import * as topicClaimsModule from '@services/topic-claims'
import { verifyTopicClaimDomain as verifyTopicClaimDomainReal } from '@services/topic-claims/verify-domain'

const h = vi.hoisted(() => ({
  mockResolveTxtRecords: vi.fn<() => Promise<string[]>>(),
  mockFetchWellKnownToken: vi.fn<() => Promise<string | null>>(),
}))

const verifyTopicClaimDomainSpy = vi.spyOn(topicClaimsModule, 'verifyTopicClaimDomain')
verifyTopicClaimDomainSpy.mockImplementation((currentUserId, claimId) =>
  verifyTopicClaimDomainReal(currentUserId, claimId, {
    resolveTxtRecords: h.mockResolveTxtRecords,
    fetchWellKnownToken: h.mockFetchWellKnownToken,
  }),
)

async function makeClaimOnTopicWithHostname() {
  const claimant = await createTestUser()
  const creator = await createTestUser()
  const hostnameId = await insertTestUrlHostname({
    hostname: `dvapi-${crypto.randomUUID().slice(0, 8)}.example.com`,
  })
  const topicSlug = `dvapi-topic-${crypto.randomUUID().slice(0, 8)}`
  const topicId = await insertTestTopic({
    name: `DVApi Topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: topicSlug,
    createdById: creator.id,
    hostnameId,
  })
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  return { claimant, creator, topicSlug, claimId: claim.id }
}

describe('topic claim domain-verification API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h.mockResolveTxtRecords.mockReset()
    h.mockFetchWellKnownToken.mockReset()
  })

  it('issues a verification token then verifies via DNS TXT', async () => {
    const { claimant, topicSlug, claimId } = await makeClaimOnTopicWithHostname()
    const request = createRequest()
    await request.authenticateAs(claimant)

    const tokenResponse = await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/verification-token`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200)
    const rawToken = tokenResponse.body.rawToken
    expect(typeof rawToken).toBe('string')
    expect(tokenResponse.body.dnsInstructions.value).toBe(rawToken)

    h.mockResolveTxtRecords.mockResolvedValueOnce([rawToken])
    h.mockFetchWellKnownToken.mockResolvedValueOnce(null)

    const verifyRequest = createRequest()
    await verifyRequest.authenticateAs(claimant)
    const verifyResponse = await verifyRequest
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/domain-verification`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(200)
    expect(verifyResponse.body.claim.verified_at).not.toBeNull()
    expect(verifyResponse.body.claim.verification_method).toBe('dns_txt')
  })

  it('returns 401 for unauthenticated domain-verification', async () => {
    const { topicSlug, claimId } = await makeClaimOnTopicWithHostname()
    const request = createRequest()
    await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/domain-verification`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(401)
  })
})

describe('GET /api/v1/topics/:idOrSlug/claims/:claimId', () => {
  it('claimant gets their claim; staff gets it; other user is 403; unknown is 404', async () => {
    const { claimant, topicSlug, claimId } = await makeClaimOnTopicWithHostname()

    const claimantReq = createRequest()
    await claimantReq.authenticateAs(claimant)
    const own = await claimantReq.get(`/api/v1/topics/${topicSlug}/claims/${claimId}`).expect(200)
    expect(own.body.claim.id).toBe(claimId)

    const staff = await createTestUser({ administrator: true })
    const staffReq = createRequest()
    await staffReq.authenticateAs(staff)
    await staffReq.get(`/api/v1/topics/${topicSlug}/claims/${claimId}`).expect(200)

    const other = await createTestUser()
    const otherReq = createRequest()
    await otherReq.authenticateAs(other)
    await otherReq.get(`/api/v1/topics/${topicSlug}/claims/${claimId}`).expect(403)

    const missingReq = createRequest()
    await missingReq.authenticateAs(claimant)
    await missingReq.get(`/api/v1/topics/${topicSlug}/claims/${crypto.randomUUID()}`).expect(404)
  })
})
