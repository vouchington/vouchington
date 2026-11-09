import assert from 'node:assert/strict'
import { beginTransaction, write } from '@data-stores/psql'
import { seedUuid } from './common.mts'
import {
  loadReportContextEntities,
  type ReportContextEntity,
} from './moderation-report-contexts.mts'

export const DETAIL_HISTORY_PER_KIND = 1_000
const REPORTER_ID = seedUuid(1_000, '01')
const FK_BY_KIND = {
  post: 'post_id',
  user: 'reported_user_id',
  url_hostname: 'hostname_id',
  rss_feed_item: 'rss_feed_item_id',
} as const

export type DetailCase = ReportContextEntity & { reportId: string }
export type DetailFixture = {
  cases: DetailCase[]
  noJudgementCase: DetailCase
  insertedJudgementIds: string[]
}

/** Reuse the hot report corpus; add exact owned judgement histories and clean them by returned id. */
export async function seedModerationReportDetailFixture(): Promise<DetailFixture> {
  const entities = await loadReportContextEntities()
  const entityByKind = new Map(entities.map(entity => [entity.entityType, entity]))
  const selected = (Object.keys(FK_BY_KIND) as Array<keyof typeof FK_BY_KIND>).map(kind => {
    const entity = entityByKind.get(kind)
    assert(entity, `Expected a seeded ${kind} report target`)
    return entity
  })
  const sparePost = entities.find(
    candidate => candidate.entityType === 'post' && candidate.entityId !== selected[0]!.entityId,
  )
  assert(sparePost, 'Expected a second seeded post report target')
  const targets = [...selected, sparePost]
  const reportIds = await lookupReportIds(targets)
  const details = targets.map(entity => {
    const reportId = reportIds.get(entity.entityId)
    assert(reportId, `Expected a seeded report for ${entity.entityType}`)
    return { ...entity, reportId }
  })
  const cases = details.slice(0, selected.length)
  const noJudgementCase = details[selected.length]!

  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(
    `/* seedModerationReportDetailFixture */
     INSERT INTO moderation_report_judgements
       (post_id, reported_user_id, hostname_id, rss_feed_item_id,
        recommended_action, public_response, internal_response, model)
     SELECT
       CASE WHEN target.kind = 'post' THEN target.id END,
       CASE WHEN target.kind = 'user' THEN target.id END,
       CASE WHEN target.kind = 'url_hostname' THEN target.id END,
       CASE WHEN target.kind = 'rss_feed_item' THEN target.id END,
       'no_action', 'Detail fixture', 'Detail fixture', 'explain-fixture'
     FROM UNNEST($1::text[], $2::uuid[]) AS target(kind, id)
     CROSS JOIN generate_series(1, $3::integer)
     RETURNING id`,
    [
      cases.map(target => target.entityType),
      cases.map(target => target.entityId),
      DETAIL_HISTORY_PER_KIND,
    ],
  )
  assert.equal(rows.length, DETAIL_HISTORY_PER_KIND * cases.length)
  await transaction.commit()
  await write(
    '/* analyzeModerationReportDetailFixture */ ANALYZE moderation_reports, moderation_report_judgements, posts, users, url_hostnames, rss_feed_items',
  )
  return { cases, noJudgementCase, insertedJudgementIds: rows.map(row => row.id) }
}

export async function cleanupModerationReportDetailFixture(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return
  await write(
    '/* cleanupModerationReportDetailFixture */ DELETE FROM moderation_report_judgements WHERE id = ANY($1::uuid[])',
    [ids],
  )
  await write(
    '/* analyzeModerationReportDetailCleanup */ ANALYZE moderation_reports, moderation_report_judgements, posts, users, url_hostnames, rss_feed_items',
  )
}

async function lookupReportIds(
  entities: readonly ReportContextEntity[],
): Promise<Map<string, string>> {
  const idsFor = (kind: ReportContextEntity['entityType']) =>
    entities.filter(entity => entity.entityType === kind).map(entity => entity.entityId)
  const { rows } = await write<{ id: string; entity_id: string }>(
    `/* lookupModerationReportDetailFixture */
     SELECT id, COALESCE(post_id, reported_user_id, hostname_id, rss_feed_item_id) AS entity_id
     FROM moderation_reports
     WHERE reporter_user_id = $1::uuid AND reviewed_at IS NULL
       AND (post_id = ANY($2::uuid[]) OR reported_user_id = ANY($3::uuid[])
         OR hostname_id = ANY($4::uuid[]) OR rss_feed_item_id = ANY($5::uuid[]))
     LIMIT $6`,
    [
      REPORTER_ID,
      idsFor('post'),
      idsFor('user'),
      idsFor('url_hostname'),
      idsFor('rss_feed_item'),
      entities.length,
    ],
  )
  return new Map(rows.map(row => [row.entity_id, row.id]))
}
