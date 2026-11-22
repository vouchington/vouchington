import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { cleanupObsoleteAgentModerations } from '@services/data-retention/cleanup-agent-moderations'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { restoreAgentModerationRetentionPages } from '../seed-data/agent-moderation-retention.mts'

const PAGE_SIZE = 100
const DAY_MS = 24 * 60 * 60 * 1_000

export async function runAgentModerationRetentionIdleScenarios(
  anchor: Date,
  seededRows: Record<string, number>,
): Promise<void> {
  const idleOptions = {
    now: anchor,
    lowerBoundDate: new Date(anchor.getTime() - 101 * DAY_MS),
    upperBoundDate: new Date(anchor.getTime() - 99 * DAY_MS),
  }
  // Drain both one-time phases of the bounded seeded keeper cohort before measuring idle.
  const settled = await cleanupObsoleteAgentModerations({
    ...idleOptions,
    batchSize: 1_000,
    maxBatches: 64,
  })
  assert.equal(settled.hasMore, false)
  await write(
    '/* vacuumSettledAgentModerationKeepers */ VACUUM (ANALYZE, INDEX_CLEANUP ON) agent_moderations',
  )
  registerScenarioContract('agent-moderation-retention-idle', {
    seededRows,
    forbidSequentialScans: ['agent_moderations'],
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
  const runIdlePage = async () => {
    const result = await cleanupObsoleteAgentModerations({
      batchSize: PAGE_SIZE,
      maxBatches: 1,
      ...idleOptions,
    })
    assert.equal(result.scanned, 0)
    assert.equal(result.deleted, 0)
    assert.equal(result.hasMore, false)
    assert.equal(result.continuation, null)
  }
  const idlePageStatements = [
    'listChangedAgentModerationRetentionPost',
    'listAgentModerationCleanupCandidates',
  ]
  await runAndCapture(
    'agent-moderation-retention-idle',
    runIdlePage,
    undefined,
    'listAgentModerationCleanupCandidates',
    { exactCapturedNames: idlePageStatements },
  )

  registerScenarioContract('agent-moderation-retention-repair-page', {
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
    'agent-moderation-retention-repair-page',
    async () => {
      const result = await cleanupObsoleteAgentModerations({
        batchSize: PAGE_SIZE,
        maxBatches: 1,
        now: anchor,
        lowerBoundDate: new Date(anchor.getTime() - 121 * DAY_MS),
        upperBoundDate: new Date(anchor.getTime() - 119 * DAY_MS),
      })
      assert.equal(result.scanned, PAGE_SIZE)
      assert.equal(result.hasMore, true)
    },
    undefined,
    'listAgentModerationCleanupCandidates',
    {
      afterCapture: restoreAgentModerationRetentionPages,
      exactCapturedNames: [
        ...idlePageStatements,
        'reconcileAgentModerationRetentionPage',
        'lockAgentModerationCleanupSources',
        'deleteObsoleteAgentModerations',
        'blockAgentModerationRetentionCandidates',
      ],
    },
  )
}
