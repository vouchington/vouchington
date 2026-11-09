import assert from 'node:assert/strict'
import { read } from '@data-stores/psql'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'
import {
  clusterFixturePostIds,
  MODERATION_CLUSTER_HOT_POST_ID,
} from '../seed-data/moderation-cluster-pages.mts'
import { loadReportContextEntities } from '../seed-data/moderation-report-contexts.mts'

const TARGETS = ['post_id', 'reported_user_id', 'hostname_id', 'rss_feed_item_id'] as const
const QUERY_NAMES = [
  ...TARGETS.map(target => `moderationClusterEmpty:${target}`),
  'moderationClusterEmpty:resolved-present',
  'moderationClusterEmpty:resolved-empty',
]

/** The trigger's NOT EXISTS probe stops at one report, even on the hot target. */
export async function runModerationClusterEmptyProbeScenarios(): Promise<void> {
  const rssItem = (await loadReportContextEntities()).find(
    entity => entity.entityType === 'rss_feed_item',
  )
  assert(rssItem)
  registerScenarioContract('moderation-cluster-writer-empty-probes', {
    forbidSequentialScans: ['moderation_reports'],
    expectations: [
      { kind: 'maxProcessedRows', relation: 'moderation_reports', max: 1 },
      { kind: 'queryBinds', token: 'LIMIT' },
      {
        kind: 'usesIndexes',
        indexes: ['idx_moderation_reports__post_id'],
        queryContains: 'moderationClusterEmpty:resolved',
      },
      ...TARGETS.map(target => ({
        kind: 'usesIndexes' as const,
        indexes: [`idx_moderation_reports__pending_${target}_id`],
        queryContains: `moderationClusterEmpty:${target}`,
      })),
    ],
  })
  await runAndCapture(
    'moderation-cluster-writer-empty-probes',
    async () => {
      await captureProbe('post_id', MODERATION_CLUSTER_HOT_POST_ID)
      await captureProbe('reported_user_id', seedUuid(50, '01'))
      await captureProbe('hostname_id', seedUuid(10, '02'))
      await captureProbe('rss_feed_item_id', rssItem.entityId)
      await captureResolvedProbe(
        'moderationClusterEmpty:resolved-present',
        clusterFixturePostIds(0)[0]!,
        false,
      )
      await captureResolvedProbe(
        'moderationClusterEmpty:resolved-empty',
        MODERATION_CLUSTER_HOT_POST_ID,
        true,
      )
    },
    undefined,
    QUERY_NAMES,
    { exactCapturedNames: QUERY_NAMES },
  )
}

async function captureProbe(target: (typeof TARGETS)[number], id: string): Promise<void> {
  const { rows } = await read<{ is_empty: boolean }>(
    `/* moderationClusterEmpty:${target} */ SELECT NOT EXISTS (SELECT 1 FROM (
      SELECT uuid_extract_timestamp(s.id) FROM moderation_reports s
      WHERE s.${target} = (SELECT $1::uuid)
        AND s.reviewed_at IS NULL AND s.resolution_action IS NULL
      ORDER BY s.id DESC LIMIT 1) remaining
    ) AS is_empty`,
    [id],
  )
  assert.equal(rows[0]?.is_empty, false)
}

async function captureResolvedProbe(
  name: string,
  postId: string,
  expected: boolean,
): Promise<void> {
  const { rows } = await read<{ is_empty: boolean }>(
    `/* ${name} */ SELECT NOT EXISTS (SELECT 1 FROM (
    SELECT uuid_extract_timestamp(s.id) FROM moderation_reports s
    WHERE s.post_id = (SELECT $1::uuid) AND s.reviewed_at IS NOT NULL
      AND s.resolution_action = $2::moderation_report_resolution_actions
    ORDER BY s.id DESC LIMIT 1) remaining
  ) AS is_empty`,
    [postId, 'reviewed'],
  )
  assert.equal(rows[0]?.is_empty, expected)
}
