import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { cleanupObsoleteAgentModerations } from '@services/data-retention/cleanup-agent-moderations'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { postSeedTimestampMs, seedUuid, seedUuidAtTimestamp } from '../seed-data/common.mts'
import {
  AGENT_MODERATION_RETENTION_RELEASED_NOISE,
  AGENT_MODERATION_RETENTION_REFERENCE_NOISE,
  AGENT_MODERATION_RETENTION_ROWS,
  restoreAgentModerationRetentionPages,
} from '../seed-data/agent-moderation-retention.mts'

const PAGE_SIZE = 100
const MAX_PRIOR_PAGE_DELETIONS = PAGE_SIZE * 2
const DAY_MS = 24 * 60 * 60 * 1_000
const CAPTURED_NAMES = [
  'listChangedAgentModerationRetentionPost',
  'listAgentModerationCleanupCandidates',
  'lockAgentModerationCleanupPosts',
  'lockAgentModerationCleanupSources',
  'deleteObsoleteAgentModerations',
  'blockAgentModerationRetentionCandidates',
] as const

export async function runAgentModerationRetentionProgressScenarios(
  anchor: Date,
  seededRows: Record<string, number>,
): Promise<void> {
  // The seeded newest result on each bulk post is itself old enough to be in
  // retention scope. A changed-free pass must not visit these 75,000 keepers.
  registerScenarioContract('agent-moderation-retention-idle', {
    seededRows,
    allowEmptyResult: true,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['agent_moderations__default_retention_due_at_id_post_id_idx'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'agent_moderations', max: 1 },
    ],
  })
  await runAndCapture(
    'agent-moderation-retention-idle',
    async () => {
      const result = await cleanupObsoleteAgentModerations({
        batchSize: PAGE_SIZE,
        maxBatches: 1,
        now: anchor,
        lowerBoundDate: new Date(anchor.getTime() - 101 * DAY_MS),
        upperBoundDate: new Date(anchor.getTime() - 99 * DAY_MS),
      })
      assert.equal(result.scanned, 0)
      assert.equal(result.hasMore, false)
    },
    undefined,
    'listAgentModerationCleanupCandidates',
    { exactCapturedNames: CAPTURED_NAMES.slice(0, 2) },
  )

  registerScenarioContract('agent-moderation-retention-live-predecessor', {
    seededRows,
    expectations: [
      {
        kind: 'usesIndexes',
        indexes: ['agent_moderations__default_post_id_prompt_id_id_idx1'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'agent_moderations', max: 1 },
    ],
  })
  await runAndCapture(
    'agent-moderation-retention-live-predecessor',
    async () => {
      const { rows } = await write<{ id: string }>(
        `/* listAgentModerationPreviousLiveResult */
         SELECT id FROM agent_moderations
         WHERE post_id = $1::uuid AND prompt_id = $2::uuid
           AND deleted_at IS NULL AND id < $3::uuid
         ORDER BY id DESC LIMIT 1`,
        [
          seedUuid(1, '05'),
          seedUuid(2_000_000, '35'),
          seedUuidAtTimestamp(anchor.getTime() + DAY_MS, 0),
        ],
      )
      assert.equal(rows.length, 1)
    },
    undefined,
    'listAgentModerationPreviousLiveResult',
    { exactCapturedNames: ['listAgentModerationPreviousLiveResult'] },
  )
}

export async function runAgentModerationRetentionLockScenario(
  scenarioId: string,
  queryName: (typeof CAPTURED_NAMES)[2] | (typeof CAPTURED_NAMES)[3],
  indexNames: readonly string[],
  relation: 'posts' | 'agent_moderations',
  continuation: Awaited<ReturnType<typeof cleanupObsoleteAgentModerations>>['continuation'],
  seededRows: Record<string, number>,
): Promise<void> {
  if (continuation === null) {
    throw new Error('The first raw page must return durable continuation')
  }
  const anchor = new Date(postSeedTimestampMs(0))
  const lowerBoundDate = new Date(anchor.getTime() - 121 * DAY_MS)
  registerScenarioContract(scenarioId, {
    seededRows,
    expectations: [
      { kind: 'usesIndexes', indexes: indexNames, anyOf: indexNames.length > 1 },
      { kind: 'maxProcessedRows', relation, max: PAGE_SIZE + 1 },
    ],
  })
  await runAndCapture(
    scenarioId,
    async () => {
      const result = await cleanupObsoleteAgentModerations({
        batchSize: PAGE_SIZE,
        maxBatches: 1,
        now: anchor,
        lowerBoundDate,
        continuation,
      })
      assert.equal(result.scanned, PAGE_SIZE)
      assert.equal(result.hasMore, true)
    },
    undefined,
    queryName,
    {
      exactCapturedNames: CAPTURED_NAMES,
      afterCapture: restoreAgentModerationRetentionPages,
    },
  )
}

export async function readAgentModerationRetentionSeedCounts(): Promise<Record<string, number>> {
  const { rows } = await write<{
    agent_moderations: string
    moderation_training_feedbacks: string
    vote_integrity_flags: string
    agent_moderation_votes: string
    moderator_actions: string
    moderation_transparency_released_daily_rollups: string
  }>(`/* readAgentModerationRetentionExplainSeedCounts */
    SELECT
      (SELECT COUNT(*) FROM agent_moderations) AS agent_moderations,
      (SELECT COUNT(*) FROM moderation_training_feedbacks) AS moderation_training_feedbacks,
      (SELECT COUNT(*) FROM vote_integrity_flags) AS vote_integrity_flags,
      (SELECT COUNT(*) FROM agent_moderation_votes) AS agent_moderation_votes,
      (SELECT COUNT(*) FROM moderator_actions) AS moderator_actions,
      (SELECT COUNT(*) FROM moderation_transparency_released_daily_rollups)
        AS moderation_transparency_released_daily_rollups`)
  const counts = rows[0]
  if (!counts) throw new Error('Missing agent moderation retention EXPLAIN seed counts')
  const result = Object.fromEntries(
    Object.entries(counts).map(([relation, count]) => [relation, Number(count)]),
  )
  assert.ok(
    result.agent_moderations >= AGENT_MODERATION_RETENTION_ROWS - MAX_PRIOR_PAGE_DELETIONS,
    `Expected at least ${AGENT_MODERATION_RETENTION_ROWS - MAX_PRIOR_PAGE_DELETIONS} agent moderations after at most ${MAX_PRIOR_PAGE_DELETIONS} prior bounded deletions, found ${result.agent_moderations}`,
  )
  for (const relation of [
    'moderation_training_feedbacks',
    'vote_integrity_flags',
    'agent_moderation_votes',
    'moderator_actions',
  ]) {
    assert.ok(
      result[relation] >= AGENT_MODERATION_RETENTION_REFERENCE_NOISE,
      `Expected at least ${AGENT_MODERATION_RETENTION_REFERENCE_NOISE} seeded reference rows in ${relation}, found ${result[relation]}`,
    )
  }
  assert.ok(
    result.moderation_transparency_released_daily_rollups >=
      AGENT_MODERATION_RETENTION_RELEASED_NOISE,
    `Expected at least ${AGENT_MODERATION_RETENTION_RELEASED_NOISE} released rollups, found ${result.moderation_transparency_released_daily_rollups}`,
  )
  return result
}
