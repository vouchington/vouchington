import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { cleanupPostModerationLedger } from '@services/data-retention/cleanup-post-moderation-ledger'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  POST_MODERATION_RETENTION_PAGE_SIZE,
  POST_MODERATION_RETENTION_SEED_COUNT,
  postModerationRetentionWindow,
} from '../seed-data/post-moderation-retention.mts'

const VERSION_PAGE = 'cleanupPostModerationLedgerPage.listVersions'
const EVIDENCE_PAGE = 'cleanupPostModerationLedgerPage.listPassEvidence'
const DELETE_VERSIONS = 'cleanupPostModerationLedgerPage.deleteVersions'
const options = {
  ...postModerationRetentionWindow(),
  batchSize: POST_MODERATION_RETENTION_PAGE_SIZE,
  maxBatches: 1,
  retentionDays: 90,
} as const

export async function runPostModerationRetentionScenarios(): Promise<void> {
  await write(`/* resetExplainPostModerationRetentionCursors */
    UPDATE post_moderation_retention_cursors
    SET cursor_record_id = NULL, sweep_lower_bound_record_id = NULL,
        sweep_upper_bound_record_id = NULL
    WHERE kind IN ('superseded_versions', 'pass_evidence')`)
  registerScenarioContract('post-moderation-version-retention-page', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['post_moderation_versions_pkey'], noSort: true },
      {
        kind: 'maxProcessedRows',
        relation: 'post_moderation_versions',
        max: POST_MODERATION_RETENTION_PAGE_SIZE + 2,
      },
    ],
    seededRows: { post_moderation_versions: POST_MODERATION_RETENTION_SEED_COUNT },
  })
  await runAndCapture(
    'post-moderation-version-retention-page',
    async () => {
      const result = await cleanupPostModerationLedger({
        ...options,
        kinds: ['superseded_versions'],
      })
      assert.equal(result.deletedVersions, 0, 'Seeded versions have no same-post successor')
      assert.equal(result.hasMore, true, 'The UUIDv7 page must have a continuation')
    },
    undefined,
    VERSION_PAGE,
  )

  registerScenarioContract('post-moderation-pass-evidence-retention-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_post_moderation_dispositions__pass_evidence_id'],
        noSort: true,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'post_moderation_dispositions',
        max: POST_MODERATION_RETENTION_PAGE_SIZE + 2,
      },
    ],
    seededRows: { post_moderation_dispositions: POST_MODERATION_RETENTION_SEED_COUNT },
  })
  await runAndCapture(
    'post-moderation-pass-evidence-retention-page',
    async () => {
      const result = await cleanupPostModerationLedger({
        ...options,
        kinds: ['pass_evidence'],
      })
      assert.equal(result.clearedPassEvidence, 0, 'Seeded pass evidence is not current')
      assert.equal(result.hasMore, true, 'The evidence page must have a continuation')
    },
    undefined,
    EVIDENCE_PAGE,
  )

  registerScenarioContract('post-moderation-successor-retention-probe', {
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_post_moderation_versions__post_id__id'] },
      { kind: 'maxProcessedRows', relation: 'post_moderation_versions', max: 500 },
    ],
    allowEmptyResult: true,
    seededRows: { post_moderation_versions: POST_MODERATION_RETENTION_SEED_COUNT },
  })
  await runAndCapture(
    'post-moderation-successor-retention-probe',
    async () => {
      const result = await cleanupPostModerationLedger({
        ...options,
        kinds: ['superseded_versions'],
      })
      assert.equal(result.deletedVersions, 0, 'Negative successor probes retain their version')
    },
    undefined,
    DELETE_VERSIONS,
  )
}
