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

describe('configured history retention rank', () => {
  it('keeps only the configured newest config revisions per key', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('dynamic_configuration_revisions')
    const { base, ...range } = createHistoryRetentionWindow(6)
    const ids = await insertConfigHistoryBatch(`retention-cap-${crypto.randomUUID()}`, base, 5)
    ownedIds.push(...ids)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      config_history_retained_revisions_per_key: 3,
    })
    try {
      await cleanupHistories({
        kinds: ['dynamic_configuration_revisions'],
        ...range,
        batchSize: 25,
        maxBatches: 9,
        now: new Date(
          Date.UTC(
            base.getUTCFullYear(),
            base.getUTCMonth() + 12,
            base.getUTCDate(),
            base.getUTCHours(),
            base.getUTCMinutes(),
            base.getUTCSeconds(),
            base.getUTCMilliseconds() + 6,
          ),
        ),
      })
    } finally {
      restore()
    }
    expect(await readRemainingHistoryIds('dynamic_configuration_revisions', ids)).toEqual(
      ids.slice(2),
    )
  })

  it('keeps only the configured newest prompt revisions per community', async () => {
    const ownedIds = await reserveHistoryRetentionFixtureIds('community_agent_prompt_revisions')
    const { base, ...range } = createHistoryRetentionWindow(6)
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: user.id,
    })
    const ids = await insertPromptHistoryBatch(community.id, prompt.id, base, 5)
    ownedIds.push(...ids)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      agent_prompt_history_retained_revisions_per_community: 3,
    })
    try {
      await cleanupHistories({
        kinds: ['community_agent_prompt_revisions'],
        ...range,
        batchSize: 25,
        maxBatches: 9,
        now: new Date(base.getTime() + 5),
      })
    } finally {
      restore()
    }
    expect(await readRemainingHistoryIds('community_agent_prompt_revisions', ids)).toEqual(
      ids.slice(2),
    )
  })
})
