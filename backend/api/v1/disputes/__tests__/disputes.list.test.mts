import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
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
import { listReviewDisputePage } from '@services/review-disputes/list-page'
import { filterReviewDisputePostContentForViewer } from '@services/posts/filter-review-dispute-post-content'
import { encodeScopedUuidCursor } from '@modules/pagination'

async function makeDisputeSetup(options?: {
  broadcast?: 'everyone' | 'followers' | 'mutual_followers' | 'users'
  clearanceStatus?: 'approved' | 'rejected'
  privacy?: 'public' | 'private'
  unpublished?: boolean
  untitled?: boolean
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
    title: options?.untitled ? '' : `List API Post ${crypto.randomUUID().slice(0, 8)}`,
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
    // staff list rows are summaries; claim text and context load from the detail route
    expect(staffDispute.claim_text).toBeUndefined()
    expect(staffDispute.staff_context).toBeUndefined()
    expect(staffDispute.post_slug).toEqual(expect.stringContaining('list-api-post-'))
    expect(staffDispute.disputant).toMatchObject({ id: claimant.id, username: claimant.username })
    const staffDetail = await staffRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)
    expect(staffDetail.body.dispute.claim_text).toEqual(expect.any(String))
    expect(staffDetail.body.dispute.staff_context.review.post.id).toBe(postId)
    expect(staffDetail.body.dispute.staff_context.review.topic.id).toBe(topicId)

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(regularUser)
    const memberResponse = await memberRequest.get('/api/v1/disputes').expect(200)
    expect(Array.isArray(memberResponse.body.disputes)).toBe(true)
    expect(memberResponse.body.page_info).toBeDefined()
    expect(typeof memberResponse.body.page_info.has_next_page).toBe('boolean')
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
    expect(memberDispute).not.toHaveProperty('review')
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
    {
      name: 'untitled private review',
      privacy: 'private' as const,
      broadcast: 'followers' as const,
      untitled: true,
      ownerCanView: true,
    },
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
      expect(memberListDispute?.post_label).toBe('review')
      const memberDetail = await memberRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)
      expect(memberDetail.body.dispute.post_content).toBeNull()
      expect(memberDetail.body.dispute.post_label).toBe('review')

      const ownerRequest = createRequest()
      await ownerRequest.authenticateAs(reviewer)
      const ownerDetail = await ownerRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)
      const ownerPostContent = ownerDetail.body.dispute.post_content
      expect(ownerPostContent === null).toBe(!options.ownerCanView || !!options.untitled)
      expect(typeof ownerPostContent?.text).toBe(
        options.ownerCanView && !options.untitled ? 'string' : 'undefined',
      )

      const staffRequest = createRequest()
      await staffRequest.authenticateAs(staff)
      const staffDetail = await staffRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)
      expect(staffDetail.body.dispute.post_content === null).toBe(!!options.untitled)
      expect(typeof staffDetail.body.dispute.post_content?.text).toBe(
        options.untitled ? 'undefined' : 'string',
      )
      expect(staffDetail.body.dispute.post_label).toEqual(expect.any(String))
      expect(staffDetail.body.dispute.post_label.startsWith('list-api-post-')).toBe(
        !!options.untitled,
      )
      expect(ownerDetail.body.dispute.post_label).toBe(
        options.ownerCanView ? staffDetail.body.dispute.post_label : 'review',
      )
    },
  )

  it('clears the post slug with the label and content for a viewer who cannot see the post', async () => {
    const { dispute, reviewer, staff } = await makeDisputeSetup({ unpublished: true })
    const page = await listReviewDisputePage({ audience: 'staff', limit: 100 })
    const row = page.disputes.find(candidate => candidate.id === dispute.id)
    expect(row?.post_slug).toEqual(expect.stringContaining('list-api-post-'))

    const [hidden] = await filterReviewDisputePostContentForViewer(reviewer, [row!])
    expect(hidden).toMatchObject({ post_content: null, post_label: 'review', post_slug: null })
    const [visible] = await filterReviewDisputePostContentForViewer(staff, [row!])
    expect(visible!.post_slug).toBe(row!.post_slug)
  })

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
