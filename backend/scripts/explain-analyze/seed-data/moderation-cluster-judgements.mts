import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { seedUuidAtTimestamp } from './common.mts'
import { MODERATION_CLUSTER_HOT_POST_ID } from './moderation-cluster-pages.mts'
import {
  loadReportContextEntities,
  type ReportContextEntity,
} from './moderation-report-contexts.mts'

export const MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET = 1024
const JUDGEMENT_TIME = Date.parse('2101-01-01T00:00:00.000Z')

export async function loadModerationClusterJudgementTargets(): Promise<
  Array<ReportContextEntity & { latestJudgementId: string }>
> {
  const contextEntities = await loadReportContextEntities()
  const entities: ReportContextEntity[] = [
    { entityType: 'post', entityId: MODERATION_CLUSTER_HOT_POST_ID },
    ...(['user', 'url_hostname', 'rss_feed_item'] as const).map(entityType => {
      const entity = contextEntities.find(candidate => candidate.entityType === entityType)
      assert(entity, `Missing judgement fixture target: ${entityType}`)
      return entity
    }),
  ]
  return entities.map((entity, index) => ({
    ...entity,
    latestJudgementId: judgementId(index, MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET - 1),
  }))
}

/** Long histories make latest-per-target lookup regressions visible in the plan. */
export async function seedModerationClusterJudgements(): Promise<void> {
  const targets = await loadModerationClusterJudgementTargets()
  const rows = targets.flatMap((target, targetIndex) =>
    Array.from({ length: MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET }, (_, index) => ({
      id: judgementId(targetIndex, index),
      postId: target.entityType === 'post' ? target.entityId : null,
      userId: target.entityType === 'user' ? target.entityId : null,
      hostnameId: target.entityType === 'url_hostname' ? target.entityId : null,
      rssItemId: target.entityType === 'rss_feed_item' ? target.entityId : null,
    })),
  )
  await write(
    `/* seedModerationClusterJudgements */
    INSERT INTO moderation_report_judgements (
      id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
      recommended_action, public_response, internal_response, model,
      context_report_count, is_context_report_count_capped, dispatched_at
    )
    SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
      'no_action', 'Synthetic public judgement', 'Synthetic internal judgement',
      'synthetic-explain-model', 32, TRUE, '2101-01-01T00:00:00Z'::timestamptz
    FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::uuid[], $5::uuid[])
      AS input(id, post_id, reported_user_id, hostname_id, rss_feed_item_id)
    ON CONFLICT (id) DO NOTHING`,
    [
      rows.map(row => row.id),
      rows.map(row => row.postId),
      rows.map(row => row.userId),
      rows.map(row => row.hostnameId),
      rows.map(row => row.rssItemId),
    ],
  )
  await write('/* analyzeModerationClusterJudgements */ ANALYZE moderation_report_judgements')
}

function judgementId(targetIndex: number, index: number): string {
  return seedUuidAtTimestamp(
    JUDGEMENT_TIME,
    targetIndex * MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET + index + 1,
  )
}
