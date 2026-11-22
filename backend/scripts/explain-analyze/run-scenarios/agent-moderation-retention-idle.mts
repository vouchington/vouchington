import assert from 'node:assert/strict'
import { cleanupObsoleteAgentModerations } from '@services/data-retention/cleanup-agent-moderations'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'

const PAGE_SIZE = 100
const DAY_MS = 24 * 60 * 60 * 1_000

export async function runAgentModerationRetentionIdleScenarios(
  anchor: Date,
  seededRows: Record<string, number>,
): Promise<void> {
  // The seeded newest result on each bulk post is itself old enough to be in
  // retention scope. The due drain must skip them; repair inspects them a page at a time.
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
      now: anchor,
      lowerBoundDate: new Date(anchor.getTime() - 101 * DAY_MS),
      upperBoundDate: new Date(anchor.getTime() - 99 * DAY_MS),
    })
    assert.equal(result.deleted, 0)
    assert.equal(result.hasMore, true)
    assert.ok(result.continuation?.repair)
  }
  const idlePageStatements = [
    'listChangedAgentModerationRetentionPost',
    'listAgentModerationCleanupCandidates',
    'listAgentModerationRetentionRepairPage',
    'repairAgentModerationRetentionDueDates',
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
        indexes: ['agent_moderations__default_id_post_id_idx'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'agent_moderations', max: PAGE_SIZE + 1 },
    ],
  })
  await runAndCapture(
    'agent-moderation-retention-repair-page',
    runIdlePage,
    undefined,
    'listAgentModerationRetentionRepairPage',
    { exactCapturedNames: idlePageStatements },
  )
}
