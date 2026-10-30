import assert from 'node:assert/strict'
import { cleanupObsoleteAgentModerations } from '@services/data-retention/cleanup-agent-moderations'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { postSeedTimestampMs } from '../seed-data/common.mts'
import { restoreAgentModerationRetentionPages } from '../seed-data/agent-moderation-retention.mts'
import {
  readAgentModerationRetentionSeedCounts,
  runAgentModerationRetentionProgressScenarios,
  runAgentModerationRetentionLockScenario,
} from './agent-moderation-retention-support.mts'

const PAGE_SIZE = 100
const DAY_MS = 24 * 60 * 60 * 1_000
const CAPTURED_NAMES = [
  'listChangedAgentModerationRetentionPost',
  'listAgentModerationCleanupCandidates',
  'lockAgentModerationCleanupPosts',
  'lockAgentModerationCleanupSources',
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

  registerScenarioContract('agent-moderation-retention-page', {
    seededRows,
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

  await runAgentModerationRetentionLockScenario(
    'agent-moderation-retention-post-lock',
    'lockAgentModerationCleanupPosts',
    ['posts__default_pkey'],
    'posts',
    continuation,
    seededRows,
  )
  await runAgentModerationRetentionLockScenario(
    'agent-moderation-retention-source-lock',
    'lockAgentModerationCleanupSources',
    [
      'agent_moderations__default_post_id_id_idx',
      'agent_moderations__default_retention_due_at_id_post_id_idx',
    ],
    'agent_moderations',
    continuation,
    seededRows,
  )

  registerScenarioContract('agent-moderation-retention-delete', {
    seededRows,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: [
          'posts__default_pkey',
          'agent_moderations__default_post_id_prompt_id_id_idx',
          'idx_moderation_training_feedbacks__agent_moderation_id',
          'idx_vote_integrity_flags__agent_moderation_id',
          'agent_moderation_votes__default_agent_moderation_id_id_idx',
          'idx_moderator_actions__agent_moderation_id',
        ],
      },
      {
        kind: 'usesIndexes',
        indexes: [
          'agent_moderations__default_post_id_prompt_id_id_idx1',
          'agent_moderations__default_post_id_prompt_id_input_sha256_idx',
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
      const nextContinuation = continuation
      if (nextContinuation === null) {
        throw new Error('The first raw page must return durable continuation')
      }
      const result = await cleanupObsoleteAgentModerations({
        batchSize: PAGE_SIZE,
        maxBatches: 1,
        now: anchor,
        lowerBoundDate,
        continuation: nextContinuation,
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
