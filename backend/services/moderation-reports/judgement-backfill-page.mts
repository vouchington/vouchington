import { read } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { MODERATION_REPORT_STATUSES, reportEntityFkColumn } from './config.mts'
import type { JudgementBackfillTargetKind } from './judgement-backfill-cursor.mts'
import { moderationReportsWorkMaxValues } from './work-limits.mts'

type Entity = { entityType: string; entityId: string; triggeringReportId: string }
type PageRow = {
  target_id: string
  entity_type: string | null
  triggering_report_id: string | null
}

const targetReads = {
  post: {
    from: 'posts',
    live: 't.deleted_at IS NULL',
    entityType: "CASE WHEN t.post_type = 'comment' THEN 'comment' ELSE 'post' END",
  },
  user: { from: 'users', live: 't.deleted_at IS NULL', entityType: "'user'" },
  url_hostname: { from: 'url_hostnames', live: 'NOT t.is_blocked', entityType: "'url_hostname'" },
  rss_feed_item: {
    from: 'rss_feed_items',
    live: 't.deleted_at IS NULL',
    entityType: "'rss_feed_item'",
  },
} as const

function newestReportSql(foreignKey: string): SQLStatement {
  const probe = (predicate: SQLStatement) =>
    sql`(SELECT r.id FROM moderation_reports r WHERE `
      .append(`r.${foreignKey} = c.target_id AND `)
      .append(predicate)
      .append(sql` ORDER BY r.id DESC LIMIT 1)`)
  const greatest = sql`GREATEST(`.append(
    probe(sql`r.reviewed_at IS NULL AND r.resolution_action IS NULL`),
  )
  for (const outcome of MODERATION_REPORT_STATUSES) {
    if (outcome === 'pending') continue
    greatest
      .append(', ')
      .append(probe(sql`r.resolution_action = ${outcome}::moderation_report_resolution_actions`))
  }
  return greatest.append(')')
}

/** One ordered cluster walk. Each target has at most one cluster per outcome, and
 * the four indexed report probes choose the newest report across all outcomes.
 * Progress follows inspected targets, including already judged or ineligible ones.
 */
export async function listMissingReportJudgementPage(
  kind: JudgementBackfillTargetKind,
  after: string | null,
  before: string,
  batchSize: number,
  remainingTargets: number,
): Promise<{ entities: Entity[]; nextTargetId: string | null }> {
  const limit = Math.min(batchSize, remainingTargets)
  const hardBatchSize = moderationReportsWorkMaxValues.backfill_batch_size
  const hardRunSize = hardBatchSize * moderationReportsWorkMaxValues.backfill_max_batches_per_run
  const foreignKey = reportEntityFkColumn(kind)
  const target = targetReads[kind]
  const statement = sql`/* listMissingReportJudgementPage */
    SELECT c.target_id, target.entity_type,
      CASE WHEN existing.hit IS NULL AND target.entity_type IS NOT NULL THEN `
    .append(newestReportSql(foreignKey))
    .append(sql` END AS triggering_report_id
    FROM (`)
    .append(`SELECT DISTINCT ON (c.${foreignKey}) c.${foreignKey} AS target_id
      FROM moderation_report_clusters c WHERE c.${foreignKey} > `)
    .append(sql`COALESCE(${after}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`)
    .append(` AND c.${foreignKey} < `)
    .append(sql`${before}::uuid ORDER BY target_id
      LIMIT LEAST(${batchSize}::int, ${hardBatchSize}::int, ${remainingTargets}::int, ${hardRunSize}::int) + 1
    ) c
    LEFT JOIN LATERAL (`)
    .append(`SELECT ${target.entityType} AS entity_type FROM ${target.from} t
      WHERE t.id = c.target_id AND ${target.live}`)
    .append(sql` LIMIT 1
    ) target ON TRUE
    LEFT JOIN LATERAL (
      SELECT TRUE AS hit FROM moderation_report_judgements j WHERE `)
    .append(`j.${foreignKey} = c.target_id`).append(sql` LIMIT 1
    ) existing ON TRUE
    ORDER BY c.target_id`)
  const { rows } = await read<PageRow>(statement)
  const page = rows.slice(0, limit)
  return {
    entities: page.flatMap(row =>
      row.entity_type && row.triggering_report_id
        ? [
            {
              entityType: row.entity_type,
              entityId: row.target_id,
              triggeringReportId: row.triggering_report_id,
            },
          ]
        : [],
    ),
    nextTargetId: rows.length > limit ? page.at(-1)!.target_id : null,
  }
}
