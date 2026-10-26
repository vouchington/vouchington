import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { PUBLIC_POST_FIELDS } from '@services/posts/public-post-projection'
import contracts from '../../../../../api-fixtures/v1/request-contracts.json' with { type: 'json' }

const BASE = '/api/v1/topic-recommendations'
const DIAGNOSTIC = /schema|must be|required|invalid/i
const publicFields = [...PUBLIC_POST_FIELDS, 'topic_recommendation']

function expectPublicRecommendation(post: Record<string, unknown>) {
  expect(Object.keys(post).every(field => new Set<string>(publicFields).has(field))).toBe(true)
  expect(
    Object.keys(post)
      .filter(field => field !== 'provenance')
      .toSorted(),
  ).toEqual(publicFields.filter(field => field !== 'provenance').toSorted())
  expect(post.topic_recommendation).toMatchObject({ status: 'pending' })
  expect(post).not.toHaveProperty('clearance_status')
  expect(post).not.toHaveProperty('lingua_rs_detected_language')
}

describe('topic-recommendations request contracts', () => {
  let author: PrivateUser
  let admin: PrivateUser
  let other: PrivateUser
  let recommendationId: string

  const newBody = (suffix: string) => ({
    markdown: `Validation ${suffix}`,
    topic_title: `Validation Topic ${suffix}`,
    topic_slug: `validation-topic-${suffix}-${Date.now()}`,
  })

  beforeAll(async () => {
    ;[author, admin, other] = await Promise.all([
      createTestUserWithAge(CONTRIBUTING_USER_AGE_MS),
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
    const request = createRequest()
    await request.authenticateAs(author)
    const created = await request
      .post(BASE)
      .send(newBody(randomUUID().slice(0, 8)))
      .expect(201)
    recommendationId = created.body.post.id
    expectPublicRecommendation(created.body.post)
  })

  it('rejects a malformed create body with 422 before any post exists', async () => {
    const request = createRequest()
    await request.authenticateAs(author)
    const suffix = randomUUID().slice(0, 8)

    await request
      .post(BASE)
      .send({ ...newBody(suffix), title: 5 })
      .expect(422)
    await request
      .post(BASE)
      .send({ ...newBody(suffix), extra: true })
      .expect(422)
    await request.post(BASE).send({ markdown: 'x' }).expect(422)
    expect((await request.get(`${BASE}?q=${suffix}`).expect(200)).body.results).toEqual([])
  })

  it('keeps the create auth gate ahead of the body contract', async () => {
    const anonymous = await createRequest().post(BASE).send({ title: 5 })
    expect(anonymous.status).toBe(401)
    expect(anonymous.body.message).not.toMatch(DIAGNOSTIC)
  })

  it('lets a malformed Idempotency-Key keep its coded 400', async () => {
    const request = createRequest()
    await request.authenticateAs(author)

    await request
      .post(BASE)
      .set('Idempotency-Key', 'not-a-uuid')
      .send(newBody(randomUUID().slice(0, 8)))
      .expect(400)
  })

  it('checks ownership before the patch body and rejects a malformed patch with 422', async () => {
    const asOther = createRequest()
    await asOther.authenticateAs(other)
    await asOther.patch(`${BASE}/${recommendationId}`).send({ title: 5 }).expect(403)
    await createRequest().patch(`${BASE}/${recommendationId}`).send({ title: 5 }).expect(401)

    const asAuthor = createRequest()
    await asAuthor.authenticateAs(author)
    await asAuthor.patch(`${BASE}/${recommendationId}`).send({ title: 5 }).expect(422)
    await asAuthor.patch(`${BASE}/${recommendationId}`).send({ extra: true }).expect(422)
    await asAuthor.patch(`${BASE}/${randomUUID()}`).send({ title: 5 }).expect(404)

    const updated = await asAuthor
      .patch(`${BASE}/${recommendationId}`)
      .send({ title: 'Renamed' })
      .expect(200)
    expect(updated.body.post.title).toBe('Renamed')
    expectPublicRecommendation(updated.body.post)
  })

  it('documents the same closed mutation post for POST and PATCH', () => {
    const schema = contracts.components.PublicTopicRecommendationPost
    expect(schema.additionalProperties).toBe(false)
    expect(Object.keys(schema.properties).toSorted()).toEqual(publicFields.toSorted())
    expect(schema.required).toContain('topic_recommendation')
    const response = {
      $ref: '#/components/schemas/TopicRecommendationMutationResponse',
    }
    expect(contracts.responses['POST:/api/v1/topic-recommendations']).toEqual(response)
    expect(contracts.responses['PATCH:/api/v1/topic-recommendations/:id']).toEqual(response)
  })

  it('checks the admin role before the rejection body and leaves the status pending', async () => {
    const anonymous = await createRequest().post(`${BASE}/${recommendationId}/rejections`).send({
      reason: 5,
    })
    expect(anonymous.status).toBe(401)
    expect(anonymous.body.message).not.toMatch(DIAGNOSTIC)

    const asAuthor = createRequest()
    await asAuthor.authenticateAs(author)
    await asAuthor.post(`${BASE}/${recommendationId}/rejections`).send({ reason: 5 }).expect(403)

    const asAdmin = createRequest()
    await asAdmin.authenticateAs(admin)
    const url = `${BASE}/${recommendationId}/rejections`
    await asAdmin.post(url).send({ reason: 5 }).expect(422)
    await asAdmin.post(url).send({ extra: true }).expect(422)
    const current = await asAdmin.get(`${BASE}/${recommendationId}`).expect(200)
    expect(current.body.post.topic_recommendation.status).toBe('pending')
  })

  it('keeps the path-only routes at 401, 403 and 404 without a schema diagnostic', async () => {
    const missing = randomUUID()
    const asAuthor = createRequest()
    await asAuthor.authenticateAs(author)
    const asAdmin = createRequest()
    await asAdmin.authenticateAs(admin)

    await createRequest().post(`${BASE}/${missing}/approvals`).send({}).expect(401)
    await asAuthor.post(`${BASE}/${missing}/approvals`).send({}).expect(403)
    await asAdmin.post(`${BASE}/${missing}/approvals`).send({}).expect(404)
    await asAdmin.get(`${BASE}/${missing}`).expect(404)
    await asAdmin.delete(`${BASE}/${missing}`).expect(404)
  })

  it('keeps the lenient top-hashtags limit clamp and cursor 400', async () => {
    const request = createRequest()
    await request.authenticateAs(author)

    await request.get(`${BASE}/top-hashtags?limit=500`).expect(200)
    await request.get(`${BASE}/top-hashtags?limit=abc`).expect(400)
    await request.get(`${BASE}/top-hashtags?after=not-a-cursor`).expect(400)
    await request.get(`${BASE}/top-hashtags?q=a&q=b`).expect(200)
    await request.get(`${BASE}/top-hashtags?mapping=nope`).expect(422)
    await request.get(`${BASE}/top-hashtags?unknown=1`).expect(200)
  })
})
