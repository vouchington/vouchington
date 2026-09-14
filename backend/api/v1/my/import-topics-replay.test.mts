import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/my/import/topics response replay', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('replays the exact existing-topic response after transport loss', async () => {
    const topic = await createTestTopic({ user })
    const idempotencyKey = crypto.randomUUID()
    const request = createRequest()
    await request.authenticateAs(user)

    const first = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idempotencyKey)
      .send({ names: [topic.name] })
      .expect(200)
    const replay = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idempotencyKey)
      .send({ names: [topic.name] })
      .expect(200)

    expect(first.body.results).toEqual([
      expect.objectContaining({ status: 'followed', entity_id: topic.id }),
    ])
    expect(replay.body).toEqual(first.body)
  })
})
