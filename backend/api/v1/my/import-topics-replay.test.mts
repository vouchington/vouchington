import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestTopic, createTestUser, getTopicImportRequestForTest } from '@voucha/test-helpers'
import { getTopicImportFailureStateForTest } from '@voucha/test-helpers/topic-import-failure-state'
import type { PrivateUser } from '@services/users/types'
import { getFollowedTopicIds } from '@services/user-import-export/import-topics-queries'

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

  it('returns a server error without partial imports when the topic lookup rejects NUL', async () => {
    const importingUser = await createTestUser()
    const topic = await createTestTopic()
    const idempotencyKey = crypto.randomUUID()
    const request = createRequest()
    await request.authenticateAs(importingUser)

    const response = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idempotencyKey)
      .send({ names: [topic.name, '\u0000topic'] })
      .expect(500)

    expect(response.body).toMatchObject({ code: '22021' })
    expect(response.body).not.toHaveProperty('results')
    await expect(getFollowedTopicIds(importingUser.id, [topic.id])).resolves.toEqual(new Set())
    await expect(getTopicImportRequestForTest(importingUser.id, topic.id)).resolves.toBeNull()
    // The actor-owned request key is reserved before lookup, but no import result is written.
    await expect(
      getTopicImportFailureStateForTest(importingUser.id, idempotencyKey),
    ).resolves.toEqual({ response: null, completed_at: null })
  })
})
