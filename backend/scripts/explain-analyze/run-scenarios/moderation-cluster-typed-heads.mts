import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { moderationReportClusterCandidatesSql } from '@services/moderation-reports/clustered-candidates'
import { selectEntityClusterRows } from '@services/moderation-reports/clustered-query'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { REPORT_CONTEXT_SEED_ROW_COUNT } from '../seed-data/moderation-report-context-counts.mts'
import { MODERATION_CLUSTER_REPORT_COUNT } from '../seed-data/moderation-cluster-pages.mts'
import {
  loadReportContextEntities,
  type ReportContextEntity,
} from '../seed-data/moderation-report-contexts.mts'

type TypedTarget = Extract<ReportContextEntity['entityType'], 'url_hostname' | 'rss_feed_item'>
type Predecessor = {
  predecessor_at: Date
  predecessor_id: string
  predecessor_type: string
}

/** A typed cursor exposes each target's ordered head probe after a preceding cluster. */
export async function runModerationClusterTypedHeadScenarios(): Promise<void> {
  const entities = await loadReportContextEntities()
  await captureTypedHead('url_hostname', entities)
  await captureTypedHead('rss_feed_item', entities)
}

async function captureTypedHead(type: TypedTarget, entities: ReportContextEntity[]): Promise<void> {
  const target = entities.find(entity => entity.entityType === type)
  assert(target, `Missing ${type} report-context target`)
  const candidates = moderationReportClusterCandidatesSql(true)
  assert.equal(candidates.values.length, 0)
  const { rows: predecessors } = await read<Predecessor>(
    `/* moderationClusterTypedHeadPredecessor */
     WITH ordered AS (
       SELECT c.entity_type, c.entity_id,
         lag(c.sort_reported_at) OVER sort_order AS predecessor_at,
         lag(c.entity_id) OVER sort_order AS predecessor_id,
         lag(c.entity_type) OVER sort_order AS predecessor_type
       FROM ${candidates.text} c WHERE c.resolution_action IS NULL
       WINDOW sort_order AS (ORDER BY c.sort_reported_at, c.entity_id, c.entity_type)
     ) SELECT predecessor_at, predecessor_id, predecessor_type FROM ordered
       WHERE entity_type = $1::moderation_report_entity_types AND entity_id = $2::uuid`,
    [type, target.entityId],
  )
  assert.equal(predecessors.length, 1)
  const predecessor = predecessors[0]!
  assert(predecessor.predecessor_id, `${type} needs a preceding pending cluster`)
  const scenarioId = `moderation-clusters-pending-${type}-head`
  registerScenarioContract(scenarioId, {
    seededRows: {
      moderation_reports: REPORT_CONTEXT_SEED_ROW_COUNT + MODERATION_CLUSTER_REPORT_COUNT,
    },
    forbidSequentialScans: ['moderation_report_clusters', 'moderation_reports'],
    expectations: [
      { kind: 'queryBinds', token: 'LIMIT' },
      {
        kind: 'usesIndexes',
        indexes: ['idx_moderation_report_clusters__pending_first_reported_at'],
      },
      {
        kind: 'usesIndexes',
        indexes: [
          `idx_moderation_reports__pending_${type === 'url_hostname' ? 'hostname' : 'rss_feed_item'}_id_id`,
        ],
      },
      { kind: 'maxProcessedRows', relation: 'moderation_report_clusters', max: 4 },
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 250 },
    ],
  })
  await runAndCapture(
    scenarioId,
    async () => {
      const rows = await selectEntityClusterRows({
        limit: 1,
        status: 'pending',
        sortAsc: true,
        beforeCursor: {
          createdAt: predecessor.predecessor_at.toISOString(),
          id: predecessor.predecessor_id,
          entityType: predecessor.predecessor_type,
        },
        cursorDirection: 'after',
      })
      assert.equal(rows[0]?.entity_id, target.entityId)
      assert.equal(rows[0]?.entity_type, type)
      assert.equal(rows[0]?.report_count, 60)
    },
    undefined,
    'listClusteredModerationReports:clusters',
  )
}
