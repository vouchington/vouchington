import assert from 'node:assert/strict'
import { runModerationCaseWriterScenario } from './moderation-case-writer.mts'
import { read, write } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  clusterFixturePostIds,
  loadModerationClusterWriterPostId,
  MODERATION_CLUSTER_HOT_POST_ID,
  MODERATION_CLUSTER_REPORT_COUNT,
} from '../seed-data/moderation-cluster-pages.mts'
import { REPORT_CONTEXT_SEED_ROW_COUNT } from '../seed-data/moderation-report-context-counts.mts'
import { loadReportContextEntities } from '../seed-data/moderation-report-contexts.mts'

const HOT_REPORTED_AT = Date.parse('2100-01-02T00:00:00Z')
const CLUSTER_INDEXES = [
  'idx_moderation_report_clusters__post_id',
  'idx_moderation_report_clusters__reported_user_id',
  'idx_moderation_report_clusters__hostname_id',
  'idx_moderation_report_clusters__rss_feed_item_id',
] as const
const LOOKUP_NAMES = [
  'moderationClusterWriterPostPending',
  'moderationClusterWriterPostReviewed',
  'moderationClusterWriterUserPending',
  'moderationClusterWriterHostnamePending',
  'moderationClusterWriterRssPending',
] as const
const EDGE_NAMES = ['moderationClusterWriterFirst', 'moderationClusterWriterLast'] as const
const LOCK_ORDER_NAME = 'moderationClusterWriterOrderedMove'

type ClusterLookup = {
  name: (typeof LOOKUP_NAMES)[number]
  action: 'reviewed' | null
  ids: [string | null, string | null, string | null, string | null]
}

/** Read-only copies of the writer's target predicates guard its indexed access paths. */
export async function runModerationClusterWriteScenarios(): Promise<void> {
  await runModerationCaseWriterScenario()
  // seedModerationCaseWriterHistory inserts reports whose trigger updates cluster index keys.
  // AUTO can leave a small dead-TID remainder, so force index cleanup before measuring bitmap work.
  await write(
    '/* prepareModerationClusterWriterPlans */ VACUUM (ANALYZE, INDEX_CLEANUP ON) moderation_report_clusters',
  )
  const rssItem = (await loadReportContextEntities()).find(
    entity => entity.entityType === 'rss_feed_item',
  )
  assert(rssItem, 'The moderation context fixture needs an RSS item')
  const writerPostId = await loadModerationClusterWriterPostId()
  registerScenarioContract('moderation-cluster-writer-targets', {
    seededRows: {
      moderation_reports: REPORT_CONTEXT_SEED_ROW_COUNT + MODERATION_CLUSTER_REPORT_COUNT,
    },
    forbidSequentialScans: ['moderation_report_clusters'],
    expectations: [
      { kind: 'maxProcessedRows', relation: 'moderation_report_clusters', max: 4 },
      { kind: 'maxBitmapIndexRows', max: 4 },
      // The first two witnesses are post outcomes; the rest follow the other FK indexes.
      ...LOOKUP_NAMES.map((name, index) => ({
        kind: 'usesIndexes' as const,
        indexes: [CLUSTER_INDEXES[Math.max(0, index - 1)]!],
        queryContains: name,
      })),
    ],
  })
  await runAndCapture(
    'moderation-cluster-writer-targets',
    async () => {
      await captureTarget({
        name: LOOKUP_NAMES[0],
        action: null,
        ids: [writerPostId, null, null, null],
      })
      await captureTarget({
        name: LOOKUP_NAMES[1],
        action: 'reviewed',
        ids: [writerPostId, null, null, null],
      })
      await captureTarget({
        name: LOOKUP_NAMES[2],
        action: null,
        ids: [null, seedUuid(50, '01'), null, null],
      })
      await captureTarget({
        name: LOOKUP_NAMES[3],
        action: null,
        ids: [null, null, seedUuid(10, '02'), null],
      })
      await captureTarget({
        name: LOOKUP_NAMES[4],
        action: null,
        ids: [null, null, null, rssItem.entityId],
      })
    },
    undefined,
    LOOKUP_NAMES,
    { exactCapturedNames: LOOKUP_NAMES },
  )

  registerScenarioContract('moderation-cluster-writer-ordered-update', {
    forbidSequentialScans: ['moderation_report_clusters'],
    expectations: [
      { kind: 'usesIndexes', indexes: [CLUSTER_INDEXES[0]] },
      { kind: 'maxProcessedRows', relation: 'moderation_report_clusters', max: 8 },
      { kind: 'maxBitmapIndexRows', max: 8 },
      { kind: 'queryBinds', token: 'ORDER' },
    ],
  })
  await runAndCapture(
    'moderation-cluster-writer-ordered-update',
    captureOrderedMove,
    undefined,
    LOCK_ORDER_NAME,
    { exactCapturedNames: [LOCK_ORDER_NAME] },
  )

  registerScenarioContract('moderation-cluster-writer-hot-edges', {
    seededRows: {
      moderation_reports: REPORT_CONTEXT_SEED_ROW_COUNT + MODERATION_CLUSTER_REPORT_COUNT,
    },
    forbidSequentialScans: ['moderation_reports'],
    expectations: [
      { kind: 'queryBinds', token: 'LIMIT' },
      {
        kind: 'usesIndexes',
        indexes: ['idx_moderation_reports__pending_post_id_id'],
        noSort: true,
      },
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 1 },
    ],
  })
  await runAndCapture(
    'moderation-cluster-writer-hot-edges',
    async () => {
      await captureHotEdge(EDGE_NAMES[0], 'ASC')
      await captureHotEdge(EDGE_NAMES[1], 'DESC')
    },
    undefined,
    EDGE_NAMES,
    { exactCapturedNames: EDGE_NAMES },
  )
}

/** Same OLD/NEW predicate and sort as the UPDATE trigger; EXPLAIN does not take row locks. */
async function captureOrderedMove(): Promise<void> {
  const postId = clusterFixturePostIds(0)[0]!
  const { rows } = await read<{ id: string }>(
    `/* ${LOCK_ORDER_NAME} */
    SELECT cluster.id FROM moderation_report_clusters cluster
    WHERE (cluster.resolution_action IS NOT DISTINCT FROM $1::moderation_report_resolution_actions
        AND (cluster.post_id = $2::uuid OR cluster.reported_user_id = $3::uuid
          OR cluster.hostname_id = $4::uuid OR cluster.rss_feed_item_id = $5::uuid))
      OR (cluster.resolution_action IS NOT DISTINCT FROM $6::moderation_report_resolution_actions
        AND (cluster.post_id = $7::uuid OR cluster.reported_user_id = $8::uuid
          OR cluster.hostname_id = $9::uuid OR cluster.rss_feed_item_id = $10::uuid))
    ORDER BY cluster.id`,
    [null, postId, null, null, null, 'reviewed', postId, null, null, null],
  )
  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map(row => row.id),
    rows.map(row => row.id).toSorted(),
  )
}

async function captureTarget(target: ClusterLookup): Promise<void> {
  const query = `/* ${target.name} */
    SELECT cluster.id, cluster.first_reported_at, cluster.last_reported_at
    FROM moderation_report_clusters cluster
    WHERE cluster.resolution_action IS NOT DISTINCT FROM $1::moderation_report_resolution_actions
      AND (cluster.post_id = $2::uuid OR cluster.reported_user_id = $3::uuid
        OR cluster.hostname_id = $4::uuid OR cluster.rss_feed_item_id = $5::uuid)`
  const { rows } = await read<{ first_reported_at: Date; last_reported_at: Date }>(query, [
    target.action,
    ...target.ids,
  ])
  assert.equal(rows.length, 1)
  assert(rows[0]!.first_reported_at <= rows[0]!.last_reported_at)
}

async function captureHotEdge(
  name: (typeof EDGE_NAMES)[number],
  order: 'ASC' | 'DESC',
): Promise<void> {
  const query = `/* ${name} */
    SELECT uuid_extract_timestamp(s.id) AS reported_at
    FROM moderation_reports s
    WHERE s.post_id = (SELECT $1::uuid) AND s.reviewed_at IS NULL AND s.resolution_action IS NULL
    ORDER BY s.id ${order} LIMIT 1`
  const { rows } = await read<{ reported_at: Date }>(query, [MODERATION_CLUSTER_HOT_POST_ID])
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.reported_at.getTime(), HOT_REPORTED_AT)
}
