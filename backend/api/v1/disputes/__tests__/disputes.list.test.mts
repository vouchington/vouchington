import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from '@services/review-disputes/parse'
import { createReviewDispute } from '@services/review-disputes/create'
import { encodeScopedUuidCursor } from '@modules/pagination'

async function makeDisputeSetup(options?: {
  broadcast?: 'everyone' | 'followers' | 'mutual_followers' | 'users'
  clearanceStatus?: 'approved' | 'rejected'
  privacy?: 'public' | 'private'
  unpublished?: boolean
}) {
  const staff = await createTestUser({ administrator: true })
  const creator = await createTestUser()
  const topicId = await insertTestTopic({
    name: `List API Topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: `list-api-topic-${crypto.randomUUID().slice(0, 8)}`,
    createdById: creator.id,
  })
  const claimant = await createTestUser()
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staff.id, claim.id)
  const reviewer = await createTestUser()
  const community = options?.unpublished
    ? await insertTestCommunity({
        name: `List API Community ${crypto.randomUUID().slice(0, 8)}`,
        slug: `list-api-community-${crypto.randomUUID().slice(0, 8)}`,
        createdById: reviewer.id,
        visibility: 'public',
      })
    : null
  const postId = await insertTestPost({
    title: `List API Post ${crypto.randomUUID().slice(0, 8)}`,
    slug: `list-api-post-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'Bad review content for list test.',
    postType: 'review',
    broadcast: options?.broadcast,
    clearanceStatus: options?.clearanceStatus,
    communityId: community?.id,
    privacy: options?.privacy,
  })
  await insertTestPostReview(postId, topicId, 1)
  if (community) {
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: reviewer.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })
  }
  const input = parseCreateReviewDisputeInput({
    post_id: postId,
    reason: 'factually_inaccurate',
    claim_text: `List API dispute ${crypto.randomUUID()}`,
  })
  const { dispute } = await createReviewDispute(claimant, input)
  return { staff, claimant, dispute, topicId, postId, reviewer }
}

describe('GET /api/v1/disputes', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser
  let claimantUser: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const setup = await makeDisputeSetup()
    claimantUser = setup.claimant
  })

  it('returns 401 for unauthenticated requests', async () => {
    const request = createRequest()
    await request.get('/api/v1/disputes').expect(401)
  })

  it('returns 200 with disputes for authenticated user', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    const response = await request.get('/api/v1/disputes').expect(200)
    expect(Array.isArray(response.body.disputes)).toBe(true)
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
  })

  it('returns full fields for staff, redacted for non-staff', async () => {
    const { dispute, claimant, topicId, postId } = await makeDisputeSetup()

    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staffUser)
    const staffResponse = await staffRequest.get('/api/v1/disputes').expect(200)
    const staffDispute = staffResponse.body.disputes.find(
      (d: { id: string }) => d.id === dispute.id,
    )
    expect(staffDispute).toBeDefined()
    expect(staffDispute.post_content).toEqual({
      text: expect.stringContaining('List API Post'),
      declared_language: null,
      lingua_rs_detected_language: null,
    })
    // staff sees private fields
    expect(Object.hasOwn(staffDispute, 'disputant_user_id')).toBe(true)
    expect(Object.hasOwn(staffDispute, 'claim_text')).toBe(true)
    expect(staffDispute.staff_context).toMatchObject({
      disputant: {
        id: claimant.id,
        username: claimant.username,
        verified_display_name: null,
        profile_image_id: null,
      },
      review: {
        post: {
          id: postId,
          title: expect.stringContaining('List API Post'),
          declared_language: null,
          lingua_rs_detected_language: null,
          slug: expect.stringContaining('list-api-post-'),
          markdown_preview: 'Bad review content for list test.',
          created_by_id: expect.any(String),
          created_at: expect.any(String),
        },
        topic: {
          id: topicId,
          name: expect.stringContaining('List API Topic'),
          slug: expect.stringContaining('list-api-topic-'),
          topic_type: expect.any(String),
        },
        rating: 1,
      },
    })

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(regularUser)
    const memberResponse = await memberRequest.get('/api/v1/disputes').expect(200)
    const memberDispute = memberResponse.body.disputes.find(
      (d: { id: string }) => d.id === dispute.id,
    )
    expect(memberDispute).toBeDefined()
    // non-staff must not see private fields
    expect(memberDispute.disputant_user_id).toBeUndefined()
    expect(memberDispute.claim_text).toBeUndefined()
    expect(memberDispute.staff_context).toBeUndefined()
    expect(memberDispute.post_content).toEqual(staffDispute.post_content)
    const rawMemberJson = JSON.stringify(memberResponse.body)
    expect(rawMemberJson).not.toContain('"staff_context"')
    expect(rawMemberJson).not.toContain('"disputant"')
    expect(rawMemberJson).not.toContain('"review"')
  })

  it.each([
    {
      name: 'private mutual-followers-only',
      broadcast: 'mutual_followers' as const,
      privacy: 'private' as const,
      ownerCanView: true,
    },
    {
      name: 'followers-only',
      broadcast: 'followers' as const,
      privacy: 'private' as const,
      ownerCanView: true,
    },
    { name: 'rejected', clearanceStatus: 'rejected' as const, ownerCanView: true },
    { name: 'unpublished', unpublished: true, ownerCanView: false },
  ])(
    'hides $name disputed-review content from an unauthorized member while preserving staff and owner access',
    async options => {
      const { staff, claimant, dispute, reviewer } = await makeDisputeSetup(options)

      const memberRequest = createRequest()
      await memberRequest.authenticateAs(claimant)
      const memberList = await memberRequest.get('/api/v1/disputes').expect(200)
      const memberListDispute = memberList.body.disputes.find(
        (candidate: { id: string }) => candidate.id === dispute.id,
      )
      expect(memberListDispute?.post_content).toBeNull()
      const memberDetail = await memberRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)
      expect(memberDetail.body.dispute.post_content).toBeNull()

      const ownerRequest = createRequest()
      await ownerRequest.authenticateAs(reviewer)
      const ownerDetail = await ownerRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)
      const ownerPostContent = ownerDetail.body.dispute.post_content
      expect(ownerPostContent === null).toBe(!options.ownerCanView)
      expect(typeof ownerPostContent?.text).toBe(options.ownerCanView ? 'string' : 'undefined')

      const staffRequest = createRequest()
      await staffRequest.authenticateAs(staff)
      const staffDetail = await staffRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)
      expect(staffDetail.body.dispute.post_content).toMatchObject({ text: expect.any(String) })
    },
  )

  it('filters by status param (dismissed returns no pending disputes)', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request.get('/api/v1/disputes?status=dismissed').expect(200)
    expect(Array.isArray(response.body.disputes)).toBe(true)
    for (const d of response.body.disputes) {
      expect(d.status).toBe('dismissed')
    }
  })

  it('mine=true scopes disputes to current user', async () => {
    const { dispute } = await makeDisputeSetup()

    const request = createRequest()
    await request.authenticateAs(claimantUser)
    const response = await request.get('/api/v1/disputes?mine=true').expect(200)
    expect(Array.isArray(response.body.disputes)).toBe(true)
    // Only own disputes returned
    for (const d of response.body.disputes) {
      expect(d.id).not.toBe(dispute.id)
    }
  })

  it('respects limit param', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request.get('/api/v1/disputes?limit=1').expect(200)
    expect(response.body.disputes.length).toBeLessThanOrEqual(1)
  })

  it('rejects member-audience and malformed cursors on the staff list', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const wrongScope = encodeScopedUuidCursor(
      crypto.randomUUID(),
      'disputes:pending:member:all:id-desc',
    )
    await request.get(`/api/v1/disputes?after=${encodeURIComponent(wrongScope)}`).expect(400)
    await request.get('/api/v1/disputes?after=not-a-cursor').expect(400)
  })
})
