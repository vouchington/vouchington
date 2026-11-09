import assert from 'node:assert/strict'
import { getLatestJudgementsForEntitiesBatch } from '@services/moderation-reports/judgements'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  loadModerationClusterJudgementTargets,
  MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET,
} from '../seed-data/moderation-cluster-judgements.mts'

/** Each selected target reads one judgement even when its history is long. */
export async function runModerationClusterJudgementScenarios(): Promise<void> {
  const targets = await loadModerationClusterJudgementTargets()
  const scenarioId = 'moderation-cluster-latest-judgements'
  const queryName = 'getLatestJudgementsForEntitiesBatch'
  registerScenarioContract(scenarioId, {
    seededRows: {
      moderation_report_judgements: targets.length * MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET,
    },
    forbidSequentialScans: ['moderation_report_judgements'],
    expectations: [
      { kind: 'maxProcessedRows', relation: 'moderation_report_judgements', max: 4 },
      {
        kind: 'usesIndexes',
        indexes: ['post_id', 'user_id', 'hostname_id', 'rss_id'].map(
          target => `idx_moderation_report_judgements__${target}`,
        ),
      },
    ],
  })
  await runAndCapture(
    scenarioId,
    async () => {
      const judgements = await getLatestJudgementsForEntitiesBatch(targets)
      assert.equal(judgements.size, targets.length)
      for (const target of targets) {
        assert.equal(
          judgements.get(`${target.entityType}:${target.entityId}`)?.id,
          target.latestJudgementId,
        )
      }
    },
    undefined,
    queryName,
    { exactCapturedNames: [queryName] },
  )
}
