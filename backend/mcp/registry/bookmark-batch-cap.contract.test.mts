import { describe, expect, it, onTestFinished } from 'vitest'
import { bookmarksWorkConfig } from '@services/bookmarks/work-limits'
import { claimTopicImportAttempt } from '@services/user-import-export/import-topics'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import {
  createTestTopic,
  createTestUser,
  getTopicFollowExistsForTest,
  topicImportAttemptExistsForTest,
} from '@voucha/test-helpers'

const SCOPES = ['bookmarks:read', 'bookmarks:write', 'posts:write'] as const

describe('MCP bookmark batch size', () => {
  it('rejects a new unkeyed batch above the configured limit without following a target', async () => {
    await bookmarksWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bookmarksWorkConfig, { set_bookmark_max_targets: 1 }),
    )
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const [first, second] = await Promise.all([createTestTopic(), createTestTopic()])
    const targets = [first, second].map(topic => ({ entity_type: 'topic', entity: topic.id }))

    const response = await callRejectedMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', { predicate: 'follow', targets }),
      SCOPES,
    )
    expect(JSON.parse(response)).toMatchObject({ error: { status: 400 } })
    await expect(getTopicFollowExistsForTest(caller.id, first.id)).resolves.toBe(false)
    await expect(getTopicFollowExistsForTest(caller.id, second.id)).resolves.toBe(false)
  })

  it('keeps exact admitted imports replayable without admitting new bookmark work', async () => {
    const caller = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const [first, second, direct] = await Promise.all([
      createTestTopic(),
      createTestTopic(),
      createTestTopic(),
    ])
    const names = [first.name, second.name]
    const args = {
      predicate: 'follow',
      recommend_unknown_topics: true,
      idempotency_key: crypto.randomUUID(),
      targets: names.map(entity => ({ entity_type: 'topic', entity })),
    }
    await claimTopicImportAttempt(caller.id, args.idempotency_key, names)

    await bookmarksWorkConfig.waitForInitialization()
    onTestFinished(
      overrideDynamicConfigFieldsForTest(bookmarksWorkConfig, { set_bookmark_max_targets: 1 }),
    )
    const resumed = await callStructuredMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', args),
      SCOPES,
    )
    expect(resumed.results).toMatchObject([
      { status: 'followed', entity_id: first.id },
      { status: 'followed', entity_id: second.id },
    ])
    await expect(
      callStructuredMcpTool(caller, 'manage_bookmark', optionArgs('set', args), SCOPES),
    ).resolves.toEqual(resumed)

    const freshKey = crypto.randomUUID()
    const fresh = await callRejectedMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', { ...args, idempotency_key: freshKey }),
      SCOPES,
    )
    expect(JSON.parse(fresh)).toMatchObject({ error: { status: 400 } })
    await expect(topicImportAttemptExistsForTest(caller.id, freshKey)).resolves.toBe(false)

    const mixed = await callRejectedMcpTool(
      caller,
      'manage_bookmark',
      optionArgs('set', {
        ...args,
        targets: [...args.targets, { entity_type: 'topic', entity: direct.id }],
      }),
      SCOPES,
    )
    expect(JSON.parse(mixed)).toMatchObject({ error: { status: 400 } })
    await expect(getTopicFollowExistsForTest(caller.id, direct.id)).resolves.toBe(false)
  })
})
