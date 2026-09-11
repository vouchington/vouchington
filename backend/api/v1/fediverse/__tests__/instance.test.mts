import { describe, expect, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  getTestFediverseInstanceIntegrationStatus,
  insertTestFediverseInstanceExtension,
} from '@voucha/test-helpers/entities/fediverse-instances'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/fediverse/instances/:id', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('resolves an instance slug and returns its hostname election', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `slug-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id })
    const response = await createRequest()
      .get(`/api/v1/fediverse/instances/${topic.slug}`)
      .expect(200)
    expect(response.body.topic.id).toBe(topic.id)
    expect(response.body.hostname_election.id).toBe(response.body.topic.hostname.id)
  })

  it('returns 404 for a nonexistent id', async () => {
    await createRequest()
      .get('/api/v1/fediverse/instances/00000000-0000-0000-0000-000000000000')
      .expect(404)
  })

  it('returns 404 for a topic that is not a fediverse_instance', async () => {
    const topic = await createTestTopic({ user: admin })

    await createRequest().get(`/api/v1/fediverse/instances/${topic.id}`).expect(404)
  })

  it('returns the topic, fediverse_instance attributes, and topic_election for a valid instance', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `detail-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({
      topicId: topic.id,
      software: 'mastodon',
      openRegistrations: true,
    })

    const response = await createRequest()
      .get(`/api/v1/fediverse/instances/${topic.id}`)
      .expect(200)

    expect(response.body.topic.id).toBe(topic.id)
    expect(response.body.fediverse_instance).toMatchObject({
      software: 'mastodon',
      open_registrations: true,
    })
    expect(response.body.fediverse_instance).not.toHaveProperty('nodeinfo_raw')
    expect(response.body.fediverse_instance).not.toHaveProperty('integration_status')
    expect(response.body.topic_election).toBeDefined()
  })
})

describe('POST /api/v1/fediverse/instances/:id/integration-changes', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    member = await createTestUser()
  })

  async function createTestInstanceTopic(hostnamePrefix: string): Promise<string> {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `${hostnamePrefix}-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id })
    return topic.id
  }

  it('returns 401 for unauthenticated callers', async () => {
    const topicId = await createTestInstanceTopic('route-unauth')

    await createRequest()
      .post(`/api/v1/fediverse/instances/${topicId}/integration-changes`)
      .send({ integration_status: 'approved' })
      .expect(401)
  })

  it('rejects a non-administrator and leaves the stored status unchanged', async () => {
    const topicId = await createTestInstanceTopic('route-forbidden')
    const request = createRequest()
    await request.authenticateAs(member)

    await request
      .post(`/api/v1/fediverse/instances/${topicId}/integration-changes`)
      .send({ integration_status: 'approved' })
      .expect(403)

    const status = await getTestFediverseInstanceIntegrationStatus(topicId)
    expect(status).toBe('pending')
  })

  it('updates the status for an administrator', async () => {
    const topicId = await createTestInstanceTopic('route-admin')
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post(`/api/v1/fediverse/instances/${topicId}/integration-changes`)
      .send({ integration_status: 'approved', reason: 'looks legit' })
      .expect(200)

    expect(response.body.integration_status).toBe('approved')

    const status = await getTestFediverseInstanceIntegrationStatus(topicId)
    expect(status).toBe('approved')
  })

  it('returns 422 for an invalid integration_status value', async () => {
    const topicId = await createTestInstanceTopic('route-invalid')
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post(`/api/v1/fediverse/instances/${topicId}/integration-changes`)
      .send({ integration_status: 'not-a-real-status' })
      .expect(422)
  })
})
