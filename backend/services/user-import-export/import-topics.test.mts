import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  getTopicFollowExistsForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { importTopics } from './import-topics.mts'

describe('topic import follow errors', () => {
  it('returns a per-item error when the follow is rejected', async () => {
    const caller = await createTestUser()
    const topic = await createTestTopic({ user: caller })

    const [result] = await importTopics(
      { ...caller, suspended_at: new Date() },
      WEB_PROVENANCE,
      [topic.name],
      {
        assertCanCreateTopicRecommendations: async () => {},
        importAttemptId: randomUUID(),
      },
    )

    expect(result).toEqual({
      input: topic.name,
      status: 'error',
      error: 'Your account has been suspended',
    })
    await expect(getTopicFollowExistsForTest(caller.id, topic.id)).resolves.toBe(false)
  })
})
