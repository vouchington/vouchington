import assert from 'node:assert/strict'
import { write } from '@data-stores/psql'
import { seedUuidAtTimestamp } from './common.mts'
import { MODERATION_CLUSTER_HOT_POST_ID } from './moderation-cluster-pages.mts'
import {
  loadReportContextEntities,
  type ReportContextEntity,
} from './moderation-report-contexts.mts'

export const MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET = 1024
/** Other entities per kind, one judgement each, so a target is a minority of its column. */
export const MODERATION_CLUSTER_JUDGEMENT_NOISE_PER_KIND = 2048
const JUDGEMENT_TIME = Date.parse('2101-01-01T00:00:00.000Z')
/** Older than any real judgement, so noise never becomes an entity's latest. */
const NOISE_JUDGEMENT_TIME = Date.parse('2020-01-01T00:00:00.000Z')

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

/**
 * Long histories make latest-per-target lookup regressions visible in the plan. The targets sit
 * among many one-judgement entities, as in production: with only four entities the planner
 * expects every filter hit within a few primary-key rows and can walk the primary key backwards,
 * which reads a different number of rows per run.
 */
export async function seedModerationClusterJudgements(): Promise<void> {
  const targets = await loadModerationClusterJudgementTargets()
  const hotRows = targets.flatMap((target, targetIndex) =>
    Array.from({ length: MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET }, (_, index) => ({
      id: judgementId(targetIndex, index),
      ...entityColumns(target),
    })),
  )
  const noiseRows = (await loadNoiseEntities(targets)).map((entity, index) => ({
    id: seedUuidAtTimestamp(NOISE_JUDGEMENT_TIME, index + 1),
    ...entityColumns(entity),
  }))
  await insertJudgements([...hotRows, ...noiseRows])
  await write('/* analyzeModerationClusterJudgements */ ANALYZE moderation_report_judgements')
}

type JudgementRow = {
  id: string
  postId: string | null
  userId: string | null
  hostnameId: string | null
  rssItemId: string | null
}

function entityColumns(entity: ReportContextEntity): Omit<JudgementRow, 'id'> {
  return {
    postId: entity.entityType === 'post' ? entity.entityId : null,
    userId: entity.entityType === 'user' ? entity.entityId : null,
    hostnameId: entity.entityType === 'url_hostname' ? entity.entityId : null,
    rssItemId: entity.entityType === 'rss_feed_item' ? entity.entityId : null,
  }
}

/** Entities with no moderation case, so no other fixture reads their judgement history. */
async function loadNoiseEntities(
  targets: readonly ReportContextEntity[],
): Promise<ReportContextEntity[]> {
  const { rows } = await write<ReportContextEntity>(
    `/* loadModerationClusterJudgementNoise */
    SELECT kind AS "entityType", id AS "entityId" FROM (
      SELECT 'post' AS kind, p.id FROM posts p
      WHERE NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.post_id = p.id)
      ORDER BY p.id LIMIT $1
    ) posts_page
    UNION ALL
    SELECT kind, id FROM (
      SELECT 'user' AS kind, u.id FROM users u
      WHERE NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.reported_user_id = u.id)
      ORDER BY u.id LIMIT $1
    ) users_page
    UNION ALL
    SELECT kind, id FROM (
      SELECT 'url_hostname' AS kind, h.id FROM url_hostnames h
      WHERE NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.hostname_id = h.id)
      ORDER BY h.id LIMIT $1
    ) hostnames_page
    UNION ALL
    SELECT kind, id FROM (
      SELECT 'rss_feed_item' AS kind, i.id FROM rss_feed_items i
      WHERE NOT EXISTS (SELECT 1 FROM moderation_cases c WHERE c.rss_feed_item_id = i.id)
      ORDER BY i.id LIMIT $1
    ) items_page`,
    [MODERATION_CLUSTER_JUDGEMENT_NOISE_PER_KIND],
  )
  const targetIds = new Set(targets.map(target => target.entityId))
  return rows.filter(entity => !targetIds.has(entity.entityId))
}

async function insertJudgements(rows: readonly JudgementRow[]): Promise<void> {
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
}

function judgementId(targetIndex: number, index: number): string {
  return seedUuidAtTimestamp(
    JUDGEMENT_TIME,
    targetIndex * MODERATION_CLUSTER_JUDGEMENTS_PER_TARGET + index + 1,
  )
}
