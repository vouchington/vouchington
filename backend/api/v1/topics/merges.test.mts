import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'

describe('POST /api/v1/topics/:sourceIdOrSlug/merges', () => {
  it('returns 401 for unauthenticated users', async () => {
    const source = await createTestTopic()
    const destination = await createTestTopic()
    await createRequest()
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: destination.id })
      .expect(401)
  })

  it('returns 403 for non-admin users', async () => {
    const user = await createTestUser()
    const source = await createTestTopic({ user })
    const destination = await createTestTopic({ user })
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: destination.id })
      .expect(403)
  })

  it('returns 422 when destination_id_or_slug is missing', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.post(`/api/v1/topics/${source.id}/merges`).send({}).expect(422)
  })

  it('rejects malformed bodies after the administrator guard', async () => {
    const administrator = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: administrator })
    const regularUser = await createTestUser()

    const forbiddenRequest = createRequest()
    await forbiddenRequest.authenticateAs(regularUser)
    await forbiddenRequest
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: 42 })
      .expect(403)

    const administratorRequest = createRequest()
    await administratorRequest.authenticateAs(administrator)
    await administratorRequest
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: 42 })
      .expect(422)
  })

  it('admits a merge and exposes its authorized status before completion', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin, name: `API Merge Source ${randomUUID()}` })
    const destination = await createTestTopic({
      user: admin,
      name: `API Merge Destination ${randomUUID()}`,
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post(`/api/v1/topics/${source.slug}/merges`)
      .send({ destination_id_or_slug: destination.id })
      .expect(202)

    expect(response.body.topic_merge).toMatchObject({
      source_topic_id: source.id,
      destination_topic_id: destination.id,
      status: 'queued',
      completed_at: null,
      error_code: null,
    })
    expect(response.body.topic).toBeUndefined()
    const statusUrl = `/api/v1/topics/${source.id}/merges/${response.body.topic_merge.id}`
    expect(response.body.topic_merge.status_url).toBe(statusUrl)
    const status = await request.get(statusUrl).expect(200)
    expect(status.body).toEqual(response.body)

    await createRequest().get(statusUrl).expect(401)
    const regularRequest = createRequest()
    await regularRequest.authenticateAs(await createTestUser())
    await regularRequest.get(statusUrl).expect(403)
    await request
      .get(`/api/v1/topics/${destination.id}/merges/${response.body.topic_merge.id}`)
      .expect(404)
    await request.get(`/api/v1/topics/${source.id}/merges/${randomUUID()}`).expect(404)
    await request.get(`/api/v1/topics/${source.id}/merges/invalid`).expect(422)
  })

  it('rejects overlapping operations and preserves source validation precedence', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({
      user: admin,
      name: `API Conflict Source ${randomUUID()}`,
    })
    const destination = await createTestTopic({
      user: admin,
      name: `API Conflict Destination ${randomUUID()}`,
    })
    const other = await createTestTopic({ user: admin, name: `API Conflict Other ${randomUUID()}` })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: destination.id })
      .expect(202)
    await request
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: other.id })
      .expect(409)
    await request
      .post(`/api/v1/topics/${randomUUID()}/merges`)
      .send({ destination_id_or_slug: 'invalid!' })
      .expect(404)

    const newSource = await createTestTopic({
      user: admin,
      name: `API Conflict New Source ${randomUUID()}`,
    })
    await request
      .post(`/api/v1/topics/${newSource.id}/merges`)
      .send({ destination_id_or_slug: source.slug })
      .expect(409)
  })
})
