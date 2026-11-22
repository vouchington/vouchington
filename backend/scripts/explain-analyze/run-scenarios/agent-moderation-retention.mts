import assert from 'node:assert/strict'
import { cleanupObsoleteAgentModerations } from '@services/data-retention/cleanup-agent-moderations'
import { releaseModerationTransparencyRange } from '@services/moderation-analytics/release-moderation-transparency-days'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { postSeedTimestampMs, seedUuid } from '../seed-data/common.mts'
import { restoreAgentModerationRetentionPages } from '../seed-data/agent-moderation-retention.mts'
import {
  readAgentModerationRetentionSeedCounts,
  runAgentModerationRetentionProgressScenarios,
} from './agent-moderation-retention-support.mts'

const PAGE_SIZE = 100
const DAY_MS = 24 * 60 * 60 * 1_000
const CAPTURED_NAMES = [
  'listChangedAgentModerationRetentionPost',
  'listAgentModerationCleanupCandidates',
  'deleteObsoleteAgentModerations',
  'blockAgentModerationRetentionCandidates',
] as const

/** Explain the actual bounded cleanup page and deletion probes against the seeded backlog. */
export async function runAgentModerationRetentionScenarios(): Promise<void> {
  const anchor = new Date(postSeedTimestampMs(0))
  const lowerBoundDate = new Date(anchor.getTime() - 121 * DAY_MS)
  const seededRows = await readAgentModerationRetentionSeedCounts()
  let continuation: Awaited<ReturnType<typeof cleanupObsoleteAgentModerations>>['continuation'] =
    null

  await runAgentModerationRetentionProgressScenarios(anchor, seededRows)

  // Settle the two earliest keeper fixtures before measuring distinct ordinary pages.
  const keepers = await cleanupObsoleteAgentModerations({
    now: anchor,
    lowerBoundDate,
    upperBoundDate: new Date(anchor.getTime() - 119 * DAY_MS),
    postIds: [seedUuid(0, '05'), seedUuid(1, '05')],
    batchSize: 10,
    maxBatches: 2,
  })
  assert.equal(keepers.hasMore, false)

  registerScenarioContract('agent-moderation-retention-page', {
    seededRows,
    forbidSequentialScans: ['agent_moderations'],
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['agent_moderations__default_retention_due_at_id_post_id_idx'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'agent_moderations', max: PAGE_SIZE + 1 },
    ],
  })
  await runAndCapture(
    'agent-moderation-retention-page',
    async () => {
      const result = await cleanupObsoleteAgentModerations({
        batchSize: PAGE_SIZE,
        maxBatches: 1,
        now: anchor,
        lowerBoundDate,
      })
      assert.equal(result.scanned, PAGE_SIZE)
      assert.equal(result.hasMore, true)
      assert.notEqual(result.continuation, null)
      const nextContinuation = result.continuation
      if (nextContinuation === null) {
        throw new Error('The first raw page must return durable continuation')
      }
      continuation = nextContinuation
    },
    undefined,
    'listAgentModerationCleanupCandidates',
    {
      exactCapturedNames: CAPTURED_NAMES,
      afterCapture: restoreAgentModerationRetentionPages,
    },
  )

  registerScenarioContract('agent-moderation-retention-delete', {
    seededRows,
    forbidSequentialScans: ['agent_moderations'],
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['posts__default_pkey', 'posts__default_llm_moderation_content_sha256_id_idx'],
        anyOf: true,
      },
      {
        kind: 'usesIndexes',
        indexes: [
          'agent_moderations__default_post_id_prompt_id_id_idx',
          'idx_moderation_training_feedbacks__agent_moderation_id',
          'idx_vote_integrity_flags__agent_moderation_id',
          'agent_moderation_votes__default_pkey',
          'idx_moderator_actions__agent_moderation_id',
        ],
      },
      {
        kind: 'usesIndexes',
        indexes: [
          'agent_moderations__default_post_id_prompt_id_id_idx1',
          'agent_moderations__default_post_id_prompt_id_input_sha256_idx',
          'agent_moderations__default_post_id_id_idx2',
        ],
        anyOf: true,
      },
      {
        kind: 'usesIndexes',
        indexes: [
          'agent_moderations__default_post_id_id_idx',
          'agent_moderations__default_retention_due_at_id_post_id_idx',
        ],
        anyOf: true,
      },
      { kind: 'maxProcessedRows', relation: 'agent_moderations', max: 1_200 },
      { kind: 'maxProcessedRows', relation: 'moderation_training_feedbacks', max: PAGE_SIZE + 1 },
      { kind: 'maxProcessedRows', relation: 'vote_integrity_flags', max: PAGE_SIZE + 1 },
      { kind: 'maxProcessedRows', relation: 'agent_moderation_votes', max: PAGE_SIZE + 1 },
      { kind: 'maxProcessedRows', relation: 'moderator_actions', max: PAGE_SIZE + 1 },
    ],
  })
  await runAndCapture(
    'agent-moderation-retention-delete',
    async () => {
      if (continuation === null) {
        throw new Error('The first raw page must return durable continuation')
      }
      const result = await cleanupObsoleteAgentModerations({
        batchSize: PAGE_SIZE,
        maxBatches: 1,
        now: anchor,
        lowerBoundDate,
        continuation: continuation,
      })
      assert.equal(result.scanned, PAGE_SIZE)
      assert.equal(result.hasMore, true)
    },
    undefined,
    'deleteObsoleteAgentModerations',
    {
      exactCapturedNames: CAPTURED_NAMES,
      afterCapture: restoreAgentModerationRetentionPages,
    },
  )
}

/** Explain the daily release GROUP BY over the seeded day's source rows. */
export async function runModerationTransparencyReleaseScenario(): Promise<void> {
  const day = new Date(postSeedTimestampMs(0) - 120 * DAY_MS)
  day.setUTCHours(0, 0, 0, 0)
  registerScenarioContract('moderation-transparency-release', {
    seededRows: await readAgentModerationRetentionSeedCounts(),
    // An INSERT without RETURNING reports zero root rows; the read side is gated below.
    allowEmptyResult: true,
    forbidSequentialScans: ['agent_moderations'],
    expectations: [
      { kind: 'usesIndexes', indexes: ['agent_moderations__default_id_idx1'] },
      { kind: 'maxProcessedRows', relation: 'agent_moderations', max: 20_000 },
    ],
  })
  await runAndCapture(
    'moderation-transparency-release',
    async () => {
      await releaseModerationTransparencyRange(day, new Date(day.getTime() + DAY_MS))
    },
    undefined,
    'releaseModerationTransparencyRange',
  )
}
