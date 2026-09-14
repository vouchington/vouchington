import { createTopicAliases } from '@services/topics/aliases'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'

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

  it('validates destination_id_or_slug', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.post(`/api/v1/topics/${source.id}/merges`).send({}).expect(400)
  })

  it('merges source aliases into the destination for admins', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin, name: `API Merge Source ${Date.now()}` })
    const destination = await createTestTopic({
      user: admin,
      name: `API Merge Destination ${Date.now()}`,
    })
    const sourceAlias = `api-merge-alias-${Math.random().toString(36).slice(2, 8)}`
    await createTopicAliases(source.id, sourceAlias)

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post(`/api/v1/topics/${source.slug}/merges`)
      .send({ destination_id_or_slug: destination.id })
      .expect(201)

    expect(response.body.topic.id).toBe(destination.id)
    expect(response.body.topic_merge).toMatchObject({
      source_topic_id: source.id,
      destination_topic_id: destination.id,
    })
    expect(response.body.topic_merge.moved_aliases).toEqual(
      expect.arrayContaining([source.slug, sourceAlias]),
    )

    const redirectResponse = await createRequest().get(`/api/v1/topics/${source.slug}`).expect(200)
    expect(redirectResponse.body.topic.id).toBe(destination.id)
    expect(redirectResponse.body.topic_redirect).toMatchObject({
      source_topic_id: source.id,
      destination_topic_id: destination.id,
    })
  })

  it('rejects already-merged source and destination identifiers', async () => {
    const admin = await createTestUser({ administrator: true })
    const source = await createTestTopic({ user: admin, name: `API Conflict Source ${Date.now()}` })
    const destination = await createTestTopic({
      user: admin,
      name: `API Conflict Destination ${Date.now()}`,
    })
    const other = await createTestTopic({ user: admin, name: `API Conflict Other ${Date.now()}` })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: destination.id })
      .expect(201)
    await request
      .post(`/api/v1/topics/${source.id}/merges`)
      .send({ destination_id_or_slug: other.id })
      .expect(409)

    const newSource = await createTestTopic({
      user: admin,
      name: `API Conflict New Source ${Date.now()}`,
    })
    await request
      .post(`/api/v1/topics/${newSource.id}/merges`)
      .send({ destination_id_or_slug: source.slug })
      .expect(409)
  })
})
