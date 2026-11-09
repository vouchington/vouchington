import { getReportJudgementContextsForEntitiesBatch } from '@services/moderation-reports/judgement-context'
import assert from 'node:assert/strict'
import {
  selectEntityClusterRows,
  selectReportsByCluster,
} from '@services/moderation-reports/clustered-query'
import type { ClusterRow } from '@services/moderation-reports/clustered-types'
import { moderationReportsWorkConfig } from '@services/moderation-reports/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { MODERATION_CLUSTER_HOT_POST_ID } from '../seed-data/moderation-cluster-pages.mts'

const CAP = 32

/** A 10,000-report target must not increase the shared summary sample or report detail work. */
export async function runModerationClusterCappedScenarios(): Promise<void> {
  await moderationReportsWorkConfig.waitForInitialization()
  const restore = overrideDynamicConfigFieldsForTest(moderationReportsWorkConfig, {
    cluster_report_count_cap: CAP,
  })
  let hot: ClusterRow | undefined
  try {
    registerScenarioContract('moderation-clusters-pending-hot-capped', {
      forbidSequentialScans: ['moderation_report_clusters', 'moderation_reports'],
      expectations: [
        {
          kind: 'usesIndexes',
          indexes: ['idx_moderation_report_clusters__pending_last_reported_at'],
        },
        { kind: 'maxProcessedRows', relation: 'moderation_report_clusters', max: 5 },
        // cap+1 on the hot target, one on the lookahead target, and both target head/hydration probes.
        { kind: 'maxProcessedRows', relation: 'moderation_reports', max: CAP + 8 },
      ],
    })
    await runAndCapture(
      'moderation-clusters-pending-hot-capped',
      async () => {
        const rows = await selectEntityClusterRows({
          limit: 1,
          status: 'pending',
          sortAsc: false,
          beforeCursor: {
            createdAt: '2150-01-01T00:00:00.000000Z',
            id: MODERATION_CLUSTER_HOT_POST_ID,
            entityType: 'post',
          },
        })
        hot = rows[0]
        assert.equal(hot?.entity_id, MODERATION_CLUSTER_HOT_POST_ID)
        assert.equal(hot.report_count, CAP)
        assert.equal(hot.report_count_capped, true)
        assert.equal(hot.reporter_count, CAP)
        assert.equal(
          Object.values(hot.reason_counts ?? {}).reduce((sum, count) => sum + count, 0),
          CAP,
        )
        assert.equal(hot.first_reported_at.toISOString(), '2100-01-02T00:00:00.000Z')
        assert.equal(hot.last_reported_at.toISOString(), '2100-01-02T00:00:00.000Z')
        assert.equal(rows[1]?.report_count, 1)
        assert.equal(rows[1]?.report_count_capped, false)
      },
      undefined,
      'listClusteredModerationReports:clusters',
      {
        exactCapturedNames: ['listClusteredModerationReports:clusters'],
      },
    )
    assert(hot)
    await captureDetails('moderation-cluster-hot-reports-asc', hot, true)
    await captureDetails('moderation-cluster-hot-reports-desc', hot, false)
    moderationReportsWorkConfig.fields.set('cluster_report_count_cap', CAP)
    await captureContext()
  } finally {
    restore()
  }
}

async function captureDetails(id: string, cluster: ClusterRow, sortAsc: boolean): Promise<void> {
  registerScenarioContract(id, {
    forbidSequentialScans: ['moderation_reports'],
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_moderation_reports__pending_post_id_id'] },
      // 25 source IDs, followed by primary-key metadata reads for only those IDs.
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 50 },
      { kind: 'queryBinds', token: 'LIMIT' },
    ],
  })
  await runAndCapture(
    id,
    async () => {
      const reports = await selectReportsByCluster('pending', [cluster], sortAsc)
      const rows = [...reports.values()].flat()
      assert.equal(rows.length, 25)
      assert(rows.every(row => row.report_count === CAP && row.report_count_capped))
      const ids = rows.map(row => row.id)
      assert.deepEqual(ids, sortAsc ? ids.toSorted() : ids.toSorted().toReversed())
    },
    undefined,
    'listClusteredModerationReports:reports',
  )
}

async function captureContext(): Promise<void> {
  registerScenarioContract('moderation-cluster-hot-judgement-context', {
    forbidSequentialScans: ['moderation_reports'],
    expectations: [
      { kind: 'usesIndexes', indexes: ['idx_moderation_reports__post_id'] },
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: CAP + 1 },
    ],
  })
  await runAndCapture(
    'moderation-cluster-hot-judgement-context',
    async () => {
      const contexts = await getReportJudgementContextsForEntitiesBatch([
        { entityType: 'post', entityId: MODERATION_CLUSTER_HOT_POST_ID },
      ])
      const context = contexts.get(`post:${MODERATION_CLUSTER_HOT_POST_ID}`)
      assert.equal(context?.reportCount, CAP)
      assert.equal(context?.reportCountCapped, true)
      assert.equal(context?.reports.length, CAP)
    },
    undefined,
    'getReportJudgementContextsForEntitiesBatch',
    { exactCapturedNames: ['getReportJudgementContextsForEntitiesBatch'] },
  )
}
