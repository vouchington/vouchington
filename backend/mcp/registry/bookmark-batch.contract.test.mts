import { deleteBookmarkAction, upsertBookmarkAction } from '@services/entity-relation-actions'
import { relationLimitsConfig } from '@services/entity-relations/relation-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestMembership,
  createTestUser,
  insertTestTopic,
  createTestTopic,
  getTopicFollowExistsForTest,
} from '@voucha/test-helpers'

const SCOPES = ['bookmarks:read', 'bookmarks:write', 'posts:write'] as const

describe('set_bookmark batch — real DB', () => {
  it('returns a status for each target when one entity is missing', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const topicId = await insertTestTopic({
      name: `Batch topic ${crypto.randomUUID()}`,
      slug: `batch-topic-${crypto.randomUUID()}`,
      createdById: caller.id,
    })
    const result = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', {
        predicate: 'follow',
        targets: [
          { entity_type: 'topic', entity: topicId },
          { entity_type: 'topic', entity: crypto.randomUUID() },
        ],
      }),
      SCOPES,
    )
    expect(result.results).toMatchObject([
      { status: 'set', bookmark: { object_id: topicId } },
      { status: 'error', error: 'Entity not found' },
    ])
  })

  it('rejects 501 targets before writing', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const targets = Array.from({ length: 501 }, () => ({
      entity_type: 'topic',
      entity: crypto.randomUUID(),
    }))
    expect(
      await callRejectedMcpTool(
        caller,
        'manage_bookmark',
        optionArgs('set', { predicate: 'follow', targets }),
        SCOPES,
      ),
    ).toContain('Invalid tool arguments')
  })

  it('retries a topic recommendation with the same idempotency key', async () => {
    const user = await createTestUser()
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    const caller = { ...user, membership_plan: 'plus' as const }
    const name = `Unseen topic ${crypto.randomUUID()}`
    const args = {
      predicate: 'follow',
      recommend_unknown_topics: true,
      idempotency_key: crypto.randomUUID(),
      targets: [{ entity_type: 'topic', entity: name }],
    }
    const first = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', args),
      SCOPES,
    )
    const second = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', args),
      SCOPES,
    )
    expect(first.results).toMatchObject([{ status: 'recommendation_created' }])
    expect(second).toEqual(first)
  })
})

describe('MCP bookmark follow capacity', () => {
  it('replays a completed topic import after capacity changes', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const [original, replacement] = await Promise.all([createTestTopic(), createTestTopic()])
    const args = {
      predicate: 'follow',
      recommend_unknown_topics: true,
      idempotency_key: crypto.randomUUID(),
      targets: [{ entity_type: 'topic', entity: original.name }],
    }
    const first = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', args),
      SCOPES,
    )
    expect(first.results).toMatchObject([{ status: 'followed', entity_id: original.id }])
    await deleteBookmarkAction(caller, {
      entityType: 'topic',
      entityId: original.id,
      predicate: 'follow',
    })
    await upsertBookmarkAction(
      caller,
      { kind: 'first_party' },
      { entityType: 'topic', entityId: replacement.id, predicate: 'follow' },
    )
    const replay = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', args),
      SCOPES,
    )
    expect(replay).toEqual(first)
    expect(await getTopicFollowExistsForTest(caller.id, original.id)).toBe(false)
    expect(await getTopicFollowExistsForTest(caller.id, replacement.id)).toBe(true)
  })
  it('refuses an overflowing batch with the REST code before following any target', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const [first, second] = await Promise.all([createTestTopic(), createTestTopic()])
    const response = await callRejectedMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', {
        predicate: 'follow',
        targets: [first, second].map(topic => ({ entity_type: 'topic', entity: topic.id })),
      }),
      SCOPES,
    )
    expect(JSON.parse(response)).toMatchObject({
      error: { status: 409, code: 'RELATION_LIMIT_REACHED' },
    })
    expect(await getTopicFollowExistsForTest(caller.id, first.id)).toBe(false)
    expect(await getTopicFollowExistsForTest(caller.id, second.id)).toBe(false)
  })

  it('counts known topic names and UUID targets together before recommendation imports', async () => {
    await relationLimitsConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(relationLimitsConfig, { follow_topic: 1 }))
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const [first, second] = await Promise.all([createTestTopic(), createTestTopic()])
    const response = await callRejectedMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', {
        predicate: 'follow',
        recommend_unknown_topics: true,
        idempotency_key: crypto.randomUUID(),
        targets: [
          { entity_type: 'topic', entity: first.name },
          { entity_type: 'topic', entity: second.id },
        ],
      }),
      SCOPES,
    )
    expect(JSON.parse(response)).toMatchObject({ error: { code: 'RELATION_LIMIT_REACHED' } })
    expect(await getTopicFollowExistsForTest(caller.id, first.id)).toBe(false)
    expect(await getTopicFollowExistsForTest(caller.id, second.id)).toBe(false)
  })
})
