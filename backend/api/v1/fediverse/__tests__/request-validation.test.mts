import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  getTestFediverseInstanceIntegrationStatus,
  insertTestFediverseInstanceExtension,
} from '@voucha/test-helpers/entities/fediverse-instances'
import type { PrivateUser } from '@services/users/types'

const DIAGNOSTIC = /schema|must be|required|invalid/i
const MALFORMED_CHANGES = [
  {},
  { integration_status: 5 },
  { integration_status: 'approved', reason: 5 },
  { integration_status: 'approved', extra: 1 },
]

describe('fediverse request contracts', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    ;[admin, member] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('checks the role and instance before the integration change body', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `contract-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id })
    const url = `/api/v1/fediverse/instances/${topic.id}/integration-changes`
    const asMember = createRequest()
    await asMember.authenticateAs(member)
    const asAdmin = createRequest()
    await asAdmin.authenticateAs(admin)

    for (const body of MALFORMED_CHANGES) {
      const anonymous = await createRequest().post(url).send(body)
      expect(anonymous.status).toBe(401)
      expect(anonymous.text).not.toMatch(DIAGNOSTIC)
      await asMember.post(url).send(body).expect(403)
      await asAdmin.post(url).send(body).expect(422)
    }
    expect(await getTestFediverseInstanceIntegrationStatus(topic.id)).toBe('pending')

    await asAdmin.post(url).send({ integration_status: 'approved' }).expect(200)
    expect(await getTestFediverseInstanceIntegrationStatus(topic.id)).toBe('approved')
  })

  it('keeps the UUID and instance lookups ahead of the body contract', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .post('/api/v1/fediverse/instances/not-a-uuid/integration-changes')
      .send({ integration_status: 'approved' })
      .expect(422)
    await request
      .post(`/api/v1/fediverse/instances/${randomUUID()}/integration-changes`)
      .send({})
      .expect(404)
  })

  it('answers 422 for a malformed create body and keeps 401 ahead of it', async () => {
    const anonymous = await createRequest().post('/api/v1/fediverse/instances').send({})
    expect(anonymous.status).toBe(401)
    expect(anonymous.text).not.toMatch(DIAGNOSTIC)

    const request = createRequest()
    await request.authenticateAs(member)
    for (const body of [{}, { hostname: 5 }, { hostname: '' }, { hostname: 'a.example', x: 1 }]) {
      await request.post('/api/v1/fediverse/instances').send(body).expect(422)
    }
  })

  it('keeps the lenient search limit handling and the 400s', async () => {
    const request = createRequest()

    await request.get('/api/v1/fediverse/search?q=a&limit=500').expect(200)
    await request.get('/api/v1/fediverse/search?q=a&limit=abc').expect(200)
    await request.get('/api/v1/fediverse/search?q=a&limit=0').expect(200)
    await request.get('/api/v1/fediverse/search?q=a&unknown=1').expect(200)
    await request.get('/api/v1/fediverse/search?q=a&cursor=x').expect(400)
    await request.get('/api/v1/fediverse/search?q=a&providers=nope').expect(400)
    await request.get('/api/v1/fediverse/search?q=a&q=b').expect(422)
  })

  it('keeps the instance detail 404 for an unknown id', async () => {
    await createRequest().get(`/api/v1/fediverse/instances/${randomUUID()}`).expect(404)
  })
})
