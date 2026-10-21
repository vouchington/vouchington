import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { describe, expect, it } from 'vitest'
import { createTestMembership, createTestUser, insertTestTopic } from '@voucha/test-helpers'

const SCOPES = ['bookmarks:read', 'bookmarks:write', 'topic-recommendations:write'] as const

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
