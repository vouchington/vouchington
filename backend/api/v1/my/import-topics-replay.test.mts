import { beforeAll, describe, expect, it, onTestFinished } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { userImportExportConfig } from '@services/user-import-export/config'
import {
  createTestTopic,
  createTestUser,
  expireTopicImportAttemptForTest,
  getTopicImportRequestForTest,
  getTopicFollowExistsForTest,
} from '@voucha/test-helpers'
import { getTopicImportFailureStateForTest } from '@voucha/test-helpers/topic-import-failure-state'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/my/import/topics response replay', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('replays the exact existing-topic response after lowering the admission limit', async () => {
    const topic = await createTestTopic({ user })
    const idempotencyKey = crypto.randomUUID()
    const names = [topic.name, topic.name]
    const request = createRequest()
    await request.authenticateAs(user)

    const first = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idempotencyKey)
      .send({ names })
      .expect(200)
    await userImportExportConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(userImportExportConfig, { topic_import_max_items: 1 }),
    )
    const replay = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idempotencyKey)
      .send({ names })
      .expect(200)

    expect(first.body.results).toHaveLength(2)
    expect(first.body.results[0]).toMatchObject({ status: 'followed', entity_id: topic.id })
    expect(replay.body).toEqual(first.body)

    const freshKey = crypto.randomUUID()
    await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', freshKey)
      .send({ names })
      .expect(400)
    await expect(getTopicImportFailureStateForTest(user.id, freshKey)).resolves.toBeNull()

    const mismatch = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idempotencyKey)
      .send({ names: [topic.name, 'Different topic'] })
      .expect(409)
    expect(mismatch.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' })

    await expireTopicImportAttemptForTest(user.id, idempotencyKey, new Date('2000-01-01T00:00:00Z'))
    await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', idempotencyKey)
      .send({ names })
      .expect(400)
    await expect(getTopicImportFailureStateForTest(user.id, idempotencyKey)).resolves.toMatchObject(
      {
        response: first.body.results,
      },
    )
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
    await expect(getTopicFollowExistsForTest(importingUser.id, topic.id)).resolves.toBe(false)
    await expect(getTopicImportRequestForTest(importingUser.id, topic.id)).resolves.toBeNull()
    // The actor-owned request key is reserved before lookup, but no import result is written.
    await expect(
      getTopicImportFailureStateForTest(importingUser.id, idempotencyKey),
    ).resolves.toEqual({ response: null, completed_at: null })
  })
})
