import { describe, expect, it } from 'vitest'
import {
  ALL_MONTHLY_PARTITION_TABLES,
  CLASSIFIER_RESULT_PARTITION_TABLES,
  DEFERRED_LEDGER_PARTITION_TABLES,
  POST_PARTITION_TABLES,
  POST_REVISION_PARTITION_TABLES,
  TOPIC_REVISION_PARTITION_TABLES,
  USER_KEY_PARTITION_TABLES,
  USER_SESSION_PARTITION_TABLES,
  USER_DATA_REQUEST_PARTITION_TABLES,
} from './partition-config.mts'
import { PARTITION_DROP_POLICIES } from './partition-drop-policies.mts'

describe('partition drop policy coverage', () => {
  it('declares a fail-closed minimum for every configured partitioned table', () => {
    const tables = [
      ...POST_PARTITION_TABLES,
      ...CLASSIFIER_RESULT_PARTITION_TABLES,
      ...USER_SESSION_PARTITION_TABLES,
      ...USER_DATA_REQUEST_PARTITION_TABLES,
      ...USER_KEY_PARTITION_TABLES,
      ...DEFERRED_LEDGER_PARTITION_TABLES,
      ...ALL_MONTHLY_PARTITION_TABLES.map(config => config.table),
    ]
    expect(Object.keys(PARTITION_DROP_POLICIES).toSorted()).toEqual(tables.toSorted())
    for (const table of tables) {
      expect(PARTITION_DROP_POLICIES[table]).toHaveProperty('minimumRetentionDays')
    }
    for (const config of ALL_MONTHLY_PARTITION_TABLES) {
      expect(PARTITION_DROP_POLICIES[config.table]?.minimumRetentionDays).toBe(
        [
          'topic_revisions',
          'post_revisions',
          'post_clearance_changes',
          'community_post_review_changes',
        ].includes(config.table)
          ? null
          : config.retentionDays,
      )
    }
    for (const table of ['post_clearance_changes', 'community_post_review_changes']) {
      expect(PARTITION_DROP_POLICIES[table]?.minimumRetentionMonths).toBe(72)
      expect(PARTITION_DROP_POLICIES[table]?.legalHoldAccountColumn).toBe('post_author_user_id')
    }
    expect(TOPIC_REVISION_PARTITION_TABLES).toContainEqual(
      expect.objectContaining({ table: 'topic_revisions', retentionDays: 0 }),
    )
    expect(PARTITION_DROP_POLICIES.topic_revisions?.minimumRetentionMonths).toBe(12)
    expect(POST_REVISION_PARTITION_TABLES).toContainEqual(
      expect.objectContaining({ table: 'post_revisions', retentionDays: 0 }),
    )
    expect(PARTITION_DROP_POLICIES.post_revisions).toMatchObject({
      minimumRetentionMonths: 72,
      retirementReferenceTables: ['posts', 'users'],
    })
  })
})
