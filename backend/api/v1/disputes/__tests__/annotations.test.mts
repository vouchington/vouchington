import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from '@services/review-disputes/parse'
import { createReviewDispute } from '@services/review-disputes/create'
import { resolveReviewDisputeAnnotate } from '@services/review-disputes/resolve'

async function makeAnnotatedPostFixture(staffId: string) {
  const creator = await createTestUser()
  const claimant = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Annotations Topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: `annotations-topic-${crypto.randomUUID().slice(0, 8)}`,
    createdById: creator.id,
  })
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staffId, claim.id)
  const reviewer = await createTestUser()
  const postId = await insertTestPost({
    title: `Annotations Review ${crypto.randomUUID().slice(0, 8)}`,
    slug: `annotations-review-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'Review for annotation test.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 2)
  const input = parseCreateReviewDisputeInput({
    post_id: postId,
    reason: 'factually_inaccurate',
    claim_text: `Annotation API test ${crypto.randomUUID()}`,
  })
  const { dispute } = await createReviewDispute(claimant, input)
  const resolved = await resolveReviewDisputeAnnotate(staffId, dispute.id, 'Context note here.')
  return { postId, dispute: resolved }
}

describe('GET /api/v1/posts/:postId/dispute-annotation', () => {
  let staffUser: PrivateUser
  let postIdWithAnnotation: string
  let postIdNoAnnotation: string

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    const fixture = await makeAnnotatedPostFixture(staffUser.id)
    postIdWithAnnotation = fixture.postId
    const creator = await createTestUser()
    postIdNoAnnotation = await insertTestPost({
      title: `No Annotation Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `no-annotation-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
      markdown: 'Regular post.',
    })
  })

  it('returns annotation when one exists (public endpoint, no auth required)', async () => {
    const request = createRequest()
    const response = await request
      .get(`/api/v1/posts/${postIdWithAnnotation}/dispute-annotation`)
      .expect(200)
    expect(response.body.annotation).not.toBeNull()
    expect(response.body.annotation.post_id).toBe(postIdWithAnnotation)
  })

  it('returns null annotation when none exists', async () => {
    const request = createRequest()
    const response = await request
      .get(`/api/v1/posts/${postIdNoAnnotation}/dispute-annotation`)
      .expect(200)
    expect(response.body.annotation).toBeNull()
  })

  it('returns 422 for non-UUID postId', async () => {
    const request = createRequest()
    await request.get('/api/v1/posts/not-a-uuid/dispute-annotation').expect(422)
  })
})

describe('GET /api/v1/posts/:postId/disputes — staff only', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser
  let annotatedPostId: string

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const fixture = await makeAnnotatedPostFixture(staffUser.id)
    annotatedPostId = fixture.postId
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get(`/api/v1/posts/${annotatedPostId}/disputes`).expect(401)
  })

  it('returns 403 for non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(`/api/v1/posts/${annotatedPostId}/disputes`).expect(403)
  })

  it('returns disputes list for staff', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request.get(`/api/v1/posts/${annotatedPostId}/disputes`).expect(200)
    expect(Array.isArray(response.body.disputes)).toBe(true)
    expect(response.body.disputes.length).toBeGreaterThan(0)
    expect(response.body.disputes[0].post_id).toBe(annotatedPostId)
  })
})

describe('POST /api/v1/posts/batch-dispute-annotations', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser
  let postIdWithAnnotation: string

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const fixture = await makeAnnotatedPostFixture(staffUser.id)
    postIdWithAnnotation = fixture.postId
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/posts/batch-dispute-annotations')
      .set('Content-Type', 'application/json')
      .send({ post_ids: [] })
      .expect(401)
  })

  it('returns 422 when post_ids is not an array', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .post('/api/v1/posts/batch-dispute-annotations')
      .set('Content-Type', 'application/json')
      .send({ post_ids: 'not-array' })
      .expect(422)
  })

  it('returns 422 when more than 50 post_ids are provided', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    const ids = Array.from({ length: 51 }, () => crypto.randomUUID())
    await request
      .post('/api/v1/posts/batch-dispute-annotations')
      .set('Content-Type', 'application/json')
      .send({ post_ids: ids })
      .expect(422)
  })

  it('returns annotations for matching post IDs', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    const response = await request
      .post('/api/v1/posts/batch-dispute-annotations')
      .set('Content-Type', 'application/json')
      .send({ post_ids: [postIdWithAnnotation, crypto.randomUUID()] })
      .expect(200)

    expect(Array.isArray(response.body.annotations)).toBe(true)
    const found = response.body.annotations.find(
      (a: { post_id: string }) => a.post_id === postIdWithAnnotation,
    )
    expect(found).toBeDefined()
  })

  it('returns empty array for empty post_ids', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    const response = await request
      .post('/api/v1/posts/batch-dispute-annotations')
      .set('Content-Type', 'application/json')
      .send({ post_ids: [] })
      .expect(200)
    expect(response.body.annotations).toEqual([])
  })
})

describe('DELETE /api/v1/disputes/:id/annotation', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 403 for non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .delete(`/api/v1/disputes/${crypto.randomUUID()}/annotation`)
      .set('Content-Type', 'application/json')
      .send({ annotation_id: crypto.randomUUID() })
      .expect(403)
  })

  it('returns 422 when annotation_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    await request
      .delete(`/api/v1/disputes/${crypto.randomUUID()}/annotation`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })

  it('returns 404 when annotation does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    await request
      .delete(`/api/v1/disputes/${crypto.randomUUID()}/annotation`)
      .set('Content-Type', 'application/json')
      .send({ annotation_id: crypto.randomUUID() })
      .expect(404)
  })

  it('removes an existing annotation', async () => {
    const fixture = await makeAnnotatedPostFixture(staffUser.id)
    const postId = fixture.postId

    // First get the annotation
    const getRequest = createRequest()
    const getResponse = await getRequest
      .get(`/api/v1/posts/${postId}/dispute-annotation`)
      .expect(200)
    const annotationId = getResponse.body.annotation.id

    const deleteRequest = createRequest()
    await deleteRequest.authenticateAs(staffUser)
    await deleteRequest
      .delete(`/api/v1/disputes/${fixture.dispute.id}/annotation`)
      .set('Content-Type', 'application/json')
      .send({ annotation_id: annotationId })
      .expect(204)

    // Annotation should now be gone
    const afterGet = await getRequest.get(`/api/v1/posts/${postId}/dispute-annotation`).expect(200)
    expect(afterGet.body.annotation).toBeNull()
  })
})
