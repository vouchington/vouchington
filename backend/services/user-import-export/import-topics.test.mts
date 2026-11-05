import { softDeleteTopic } from '@voucha/test-helpers/entities/topics/deletion'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestTopic,
  createTestUser,
  getTopicFollowExistsForTest,
  insertTestTopic,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { importTopics } from './import-topics.mts'

describe('topic import follow audits', () => {
  it('audits only the input that caused the follow when a topic repeats', async () => {
    const caller = await createTestUser()
    const topic = await createTestTopic({ user: caller })
    const audits: Array<{ index: number; topicId?: string }> = []

    const results = await importTopics(caller, WEB_PROVENANCE, [topic.name, topic.name], {
      assertCanCreateTopicRecommendations: async () => {},
      importAttemptId: randomUUID(),
      recordImportRequests: async (_userId, rows) => {
        audits.push(...rows)
      },
    })

    expect(results.map(result => result.status)).toEqual(['followed', 'already_following'])
    expect(audits.filter(audit => audit.topicId === topic.id).map(audit => audit.index)).toEqual([
      0,
    ])
  })

  it('follows a renamed topic by its derived slug instead of recommending a duplicate', async () => {
    const caller = await createTestUser()
    const suffix = randomUUID().slice(0, 8)
    const existingId = await insertTestTopic({
      createdById: caller.id,
      name: `Chase Sapphire Preferred ${suffix}`,
      slug: `chase-sapphire-${suffix}`,
    })
    let recommendationGateCalls = 0

    const [result] = await importTopics(caller, WEB_PROVENANCE, [`Chase Sapphire ${suffix}`], {
      assertCanCreateTopicRecommendations: async () => {
        recommendationGateCalls += 1
      },
      importAttemptId: randomUUID(),
    })

    expect(result).toMatchObject({ status: 'followed', entity_id: existingId })
    expect(recommendationGateCalls).toBe(0)
    await expect(getTopicFollowExistsForTest(caller.id, existingId)).resolves.toBe(true)
  })
})

describe('topic import follow errors', () => {
  it('follows valid topics when another target cannot be bookmarked', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const caller = await createTestUser()
    const [invalid, valid] = await Promise.all([createTestTopic(), createTestTopic()])
    const unknown = `Missing topic ${randomUUID()}`
    const names = [invalid.name, valid.name, unknown]
    const options = {
      assertCanCreateTopicRecommendations: async () => {
        await softDeleteTopic(invalid.id, caller.id)
        throw new Error('Recommendation disabled for this test')
      },
      importAttemptId: randomUUID(),
    }
    const results = await importTopics(caller, WEB_PROVENANCE, names, options)
    expect(await importTopics(caller, WEB_PROVENANCE, names, options)).toEqual(results)
    expect(results[0]).toMatchObject({ status: 'error' })
    expect(results[1]).toMatchObject({ status: 'followed', entity_id: valid.id })
    expect(await getTopicFollowExistsForTest(caller.id, valid.id)).toBe(true)
  })
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

describe('topic import follow capacity', () => {
  it('follows the available prefix, reports skipped inputs, and replays the result', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const user = await createTestUser()
    const [first, second] = await Promise.all([createTestTopic(), createTestTopic()])
    const options = {
      assertCanCreateTopicRecommendations: async () => {},
      importAttemptId: randomUUID(),
    }
    const names = [first.name, first.name, second.name, second.name]
    const results = await importTopics(user, WEB_PROVENANCE, names, options)
    expect(results.map(result => result.status)).toEqual([
      'followed',
      'already_following',
      'skipped',
      'skipped',
    ])
    expect(results.slice(2)).toEqual([
      {
        input: second.name,
        entity_id: second.id,
        status: 'skipped',
        error_code: 'RELATION_LIMIT_REACHED',
      },
      {
        input: second.name,
        entity_id: second.id,
        status: 'skipped',
        error_code: 'RELATION_LIMIT_REACHED',
      },
    ])
    expect(await getTopicFollowExistsForTest(user.id, first.id)).toBe(true)
    expect(await getTopicFollowExistsForTest(user.id, second.id)).toBe(false)
    expect(await importTopics(user, WEB_PROVENANCE, names, options)).toEqual(results)
  })
})
