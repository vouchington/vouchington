import assert from 'node:assert/strict'
import { extractQueryName, getCapturedQueries, write } from '@data-stores/psql'
import { cleanupPostModerationLedger } from '@services/data-retention/cleanup-post-moderation-ledger'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  POST_MODERATION_RETENTION_PAGE_SIZE,
  POST_MODERATION_RETENTION_SEED_COUNT,
  POST_MODERATION_RETENTION_SUCCESSOR_COUNT,
  postModerationRetentionWindow,
  rearmSeedPostModerationPassEvidence,
  seedPostModerationRetentionSuccessors,
  setSeedPostModerationPassEvidenceDormant,
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
    SET cursor_record_id = NULL, cursor_due_at = NULL, cursor_lower_bound_record_id = NULL,
        sweep_upper_bound_record_id = NULL
    WHERE kind IN ('superseded_versions', 'pass_evidence')`)
  registerScenarioContract('post-moderation-retention-idle-keepers', {
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_post_moderation_versions__retention_due'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'post_moderation_versions', max: 1 },
    ],
    seededRows: { post_moderation_versions: POST_MODERATION_RETENTION_SEED_COUNT },
  })
  await runAndCapture(
    'post-moderation-retention-idle-keepers',
    async () => {
      const result = await cleanupPostModerationLedger({
        ...options,
        kinds: ['superseded_versions'],
      })
      assert.equal(result.deletedVersions, 0)
      assert.equal(result.hasMore, false)
    },
    undefined,
    VERSION_PAGE,
    {
      afterCapture: async () => {
        const names = getCapturedQueries().map(query => extractQueryName(query.text))
        assert.equal(names.includes('cleanupPostModerationLedgerPage.lockPagePosts'), false)
        assert.equal(names.includes('lockChangedPostModerationRetentionPost'), false)
      },
    },
  )
  await seedPostModerationRetentionSuccessors()
  registerScenarioContract('post-moderation-version-retention-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_post_moderation_versions__retention_due'],
        noSort: true,
      },
      {
        kind: 'maxProcessedRows',
        relation: 'post_moderation_versions',
        max: POST_MODERATION_RETENTION_PAGE_SIZE + 2,
      },
    ],
    seededRows: {
      post_moderation_versions:
        POST_MODERATION_RETENTION_SEED_COUNT + POST_MODERATION_RETENTION_SUCCESSOR_COUNT,
    },
  })
  await runAndCapture(
    'post-moderation-version-retention-page',
    async () => {
      const result = await cleanupPostModerationLedger({
        ...options,
        kinds: ['superseded_versions'],
      })
      assert.equal(result.deletedVersions, POST_MODERATION_RETENTION_PAGE_SIZE)
      assert.equal(result.hasMore, true, 'The due page must have a continuation')
    },
    undefined,
    VERSION_PAGE,
  )

  await setSeedPostModerationPassEvidenceDormant()
  registerScenarioContract('post-moderation-pass-evidence-idle-keepers', {
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_post_moderation_dispositions__retention_due'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'post_moderation_dispositions', max: 1 },
    ],
    seededRows: { post_moderation_dispositions: POST_MODERATION_RETENTION_SEED_COUNT },
  })
  await runAndCapture(
    'post-moderation-pass-evidence-idle-keepers',
    async () => {
      const result = await cleanupPostModerationLedger({ ...options, kinds: ['pass_evidence'] })
      assert.equal(result.clearedPassEvidence, 0)
      assert.equal(result.hasMore, false)
    },
    undefined,
    EVIDENCE_PAGE,
    {
      afterCapture: async () => {
        const names = getCapturedQueries().map(query => extractQueryName(query.text))
        assert.equal(names.includes('cleanupPostModerationLedgerPage.lockPagePosts'), false)
        assert.equal(names.includes('lockChangedPostModerationRetentionPost'), false)
      },
    },
  )
  await rearmSeedPostModerationPassEvidence()

  registerScenarioContract('post-moderation-pass-evidence-retention-page', {
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['idx_post_moderation_dispositions__retention_due'],
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
      assert.equal(result.hasMore, true, 'The due evidence page must have a continuation')
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
      assert.equal(result.deletedVersions, POST_MODERATION_RETENTION_PAGE_SIZE)
    },
    undefined,
    DELETE_VERSIONS,
  )
}
