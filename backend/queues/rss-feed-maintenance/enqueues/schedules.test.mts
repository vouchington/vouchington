import { describe, expect, it } from 'vitest'
import { TOPIC_ALIAS_ORDERING } from '../config.mts'
import { scheduledJobManifest, upsertSchedules } from './schedules.mts'
import { topicAliasUnlinkRecoveryOrdering } from './unlink-topic-alias.mts'

describe('topic alias schedules', () => {
  it('registers the durable category-mapping recovery scheduler', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })

  it('serializes category-mapping recovery jobs globally', () => {
    expect(
      scheduledJobManifest.jobs.find(
        job => job.schedulerId === 'reconcileTopicAliasCategoryMappings',
      )?.template.opts,
    ).toMatchObject({
      ordering: TOPIC_ALIAS_ORDERING.category_mapping_reconciliation,
    })
  })

  it('serializes topic alias unlink recovery separately from page jobs', () => {
    expect(
      scheduledJobManifest.jobs.find(job => job.schedulerId === 'recoverTopicAliasUnlinks')
        ?.template.opts,
    ).toMatchObject({
      ordering: topicAliasUnlinkRecoveryOrdering(),
    })
    expect(topicAliasUnlinkRecoveryOrdering().key).toBe('topic-alias-unlink:recovery')
  })
})
