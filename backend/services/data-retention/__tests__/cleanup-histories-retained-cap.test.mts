import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityAgentPrompt,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createHistoryRetentionWindow,
  insertConfigHistoryBatch,
  insertPromptHistoryBatch,
} from '@voucha/test-helpers/history-retention-seeds'
import {
  readRemainingHistoryIds,
  reserveHistoryRetentionFixtureIds,
} from '@voucha/test-helpers/history-retention-reads'
import { cleanupHistories } from '../cleanup-histories.mts'
import { dataRetentionConfig } from '../config.mts'

async function runConfigCase(retained: number, count: number) {
  const ownedIds = await reserveHistoryRetentionFixtureIds('dynamic_configuration_revisions')
  const { base, ...range } = createHistoryRetentionWindow(count + 1)
  const ids = await insertConfigHistoryBatch(`retention-cap-${crypto.randomUUID()}`, base, count)
  ownedIds.push(...ids)
  const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
    config_history_retained_revisions_per_key: retained,
  })
  try {
    await cleanupHistories({
      kinds: ['dynamic_configuration_revisions'],
      ...range,
      batchSize: 100,
      maxBatches: 9,
      now: new Date(
        Date.UTC(
          base.getUTCFullYear(),
          base.getUTCMonth() + 12,
          base.getUTCDate(),
          base.getUTCHours(),
          base.getUTCMinutes(),
          base.getUTCSeconds(),
          base.getUTCMilliseconds() + count + 1,
        ),
      ),
    })
  } finally {
    restore()
  }
  return { ids, remaining: await readRemainingHistoryIds('dynamic_configuration_revisions', ids) }
}

async function runPromptCase(retained: number, count: number) {
  const ownedIds = await reserveHistoryRetentionFixtureIds('community_agent_prompt_revisions')
  const { base, ...range } = createHistoryRetentionWindow(count + 1)
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id })
  const prompt = await insertTestCommunityAgentPrompt({
    communityId: community.id,
    createdById: user.id,
  })
  const ids = await insertPromptHistoryBatch(community.id, prompt.id, base, count)
  ownedIds.push(...ids)
  const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
    agent_prompt_history_retained_revisions_per_community: retained,
  })
  try {
    await cleanupHistories({
      kinds: ['community_agent_prompt_revisions'],
      ...range,
      batchSize: 300,
      maxBatches: 9,
      now: new Date(base.getTime() + count),
    })
  } finally {
    restore()
  }
  return { ids, remaining: await readRemainingHistoryIds('community_agent_prompt_revisions', ids) }
}

describe('configured history retention rank', () => {
  it('honours a raised config revision count per key', async () => {
    const { ids, remaining } = await runConfigCase(51, 53)
    expect(remaining).toEqual(ids.slice(2))
  })

  it('keeps at least the default config revisions when configured lower', async () => {
    const { ids, remaining } = await runConfigCase(3, 52)
    expect(remaining).toEqual(ids.slice(2))
  })

  it('honours a raised prompt revision count per community', async () => {
    const { ids, remaining } = await runPromptCase(201, 203)
    expect(remaining).toEqual(ids.slice(2))
  })

  it('keeps at least the default prompt revisions when configured lower', async () => {
    const { ids, remaining } = await runPromptCase(3, 202)
    expect(remaining).toEqual(ids.slice(2))
  })
})
