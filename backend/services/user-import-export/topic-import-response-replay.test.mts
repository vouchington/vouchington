import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createTestTopic, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { importTopics } from './import-topics.mts'

describe('topic import response replay', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  const options = () => ({
    assertCanCreateTopicRecommendations: async () => {},
    importAttemptId: randomUUID(),
  })

  it('replays the exact followed result after the first response is lost', async () => {
    const topic = await createTestTopic({ user })
    const attempt = options()

    const first = await importTopics(WEB_PROVENANCE, user, [topic.name], attempt)
    const replay = await importTopics(WEB_PROVENANCE, user, [topic.name], attempt)

    expect(first).toEqual([
      expect.objectContaining({ input: topic.name, status: 'followed', entity_id: topic.id }),
    ])
    expect(replay).toEqual(first)
  })

  it('rejects a changed ordered batch under the same import attempt', async () => {
    const first = await createTestTopic({ user })
    const second = await createTestTopic({ user })
    const attempt = options()

    await importTopics(WEB_PROVENANCE, user, [first.name, second.name], attempt)

    await expect(
      importTopics(WEB_PROVENANCE, user, [second.name, first.name], attempt),
    ).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      status: 409,
    })
  })
})
