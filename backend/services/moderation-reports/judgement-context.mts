import { read } from '@data-stores/psql'
import crypto from 'node:crypto'
import sql from 'sql-template-strings'
import {
  type ModerationReportEntityType,
  MODERATION_REPORT_FK_COLUMNS,
  MODERATION_REPORT_REASON_SEVERITY_RANK,
  type ModerationReportReason,
  reportEntityFkColumn,
} from './config.mts'

/** Cap on reports fed to the judgement agent — bounds prompt size / cost for popular entities. */
export const MAX_REPORTS_FOR_JUDGEMENT = 50

const REPORT_REASON_SEVERITY_RANK: Record<ModerationReportReason, number> =
  MODERATION_REPORT_REASON_SEVERITY_RANK

export type ReportJudgementContext = {
  contextHash: string
  reportCount: number
  noteHash: string
  maxReasonRank: number
}

type ReportContextRow = {
  fk_column: string
  entity_id: string
  report_count: number
  reports: Array<{ id: string; reason: ModerationReportReason; note: string | null }>
}

export async function getReportJudgementContextForEntity(
  entityType: ModerationReportEntityType,
  entityId: string,
): Promise<ReportJudgementContext> {
  const contexts = await getReportJudgementContextsForEntitiesBatch([{ entityType, entityId }])
  return contexts.get(`${entityType}:${entityId}`) ?? buildReportJudgementContext([], 0)
}

export async function getReportJudgementContextsForEntitiesBatch(
  entities: Array<{ entityType: ModerationReportEntityType; entityId: string }>,
): Promise<Map<string, ReportJudgementContext>> {
  const result = new Map<string, ReportJudgementContext>()
  if (entities.length === 0) return result

  const byFk = new Map<string, string[]>()
  const entityTypeByFkAndId = new Map<string, ModerationReportEntityType>()
  for (const entity of entities) {
    const fkColumn = reportEntityFkColumn(entity.entityType)
    entityTypeByFkAndId.set(`${fkColumn}:${entity.entityId}`, entity.entityType)
    const ids = byFk.get(fkColumn)
    if (ids) {
      ids.push(entity.entityId)
    } else {
      byFk.set(fkColumn, [entity.entityId])
    }
  }

  const rows = await selectReportContextRows(byFk)
  for (const row of rows) {
    const context = buildReportJudgementContext(row.reports, row.report_count)
    const entityType = entityTypeByFkAndId.get(`${row.fk_column}:${row.entity_id}`)
    if (entityType) {
      result.set(`${entityType}:${row.entity_id}`, context)
    }
  }

  for (const entity of entities) {
    const key = `${entity.entityType}:${entity.entityId}`
    if (!result.has(key)) result.set(key, buildReportJudgementContext([], 0))
  }
  return result
}

function reportReasonSeverityRank(reason: ModerationReportReason): number {
  return REPORT_REASON_SEVERITY_RANK[reason]
}

/**
 * One statement for every entity kind: a branch per foreign key column that has ids. An entity
 * without reports yields no row; the caller fills in the empty context.
 */
async function selectReportContextRows(byFk: Map<string, string[]>): Promise<ReportContextRow[]> {
  const query = sql`/* getReportJudgementContextsForEntitiesBatch */
      WITH ranked_reports AS (`
  let first = true
  for (const fkColumn of MODERATION_REPORT_FK_COLUMNS) {
    const ids = byFk.get(fkColumn)
    if (!ids) continue
    if (!first) query.append(sql` UNION ALL `)
    first = false
    query.append(sql`
        SELECT
          ${fkColumn}::text AS fk_column,
          r.`)
    query.append(fkColumn)
    query.append(sql` AS entity_id,
          r.id,
          r.reason,
          r.note,
          COUNT(*) OVER (PARTITION BY r.`)
    query.append(fkColumn)
    query.append(sql`)::integer AS report_count,
          ROW_NUMBER() OVER (
            PARTITION BY r.`)
    query.append(fkColumn)
    query.append(sql`
            ORDER BY r.id DESC
          ) AS report_rank
        FROM moderation_reports r
        WHERE r.`)
    query.append(fkColumn)
    query.append(sql` = ANY(${ids}::uuid[])`)
  }
  query.append(sql`
      )
      SELECT
        fk_column,
        entity_id,
        MAX(report_count)::integer AS report_count,
        COALESCE(
          jsonb_agg(
            jsonb_build_object('id', id, 'reason', reason, 'note', note)
            ORDER BY id DESC
          ) FILTER (WHERE report_rank <= ${MAX_REPORTS_FOR_JUDGEMENT}),
          '[]'::jsonb
        ) AS reports
      FROM ranked_reports
      GROUP BY fk_column, entity_id
    `)
  const { rows } = await read<ReportContextRow>(query)
  return rows
}

function buildReportJudgementContext(
  reports: Array<{ id: string; reason: ModerationReportReason; note: string | null }>,
  reportCount: number,
): ReportJudgementContext {
  const normalizedReports = reports.map(report => ({
    id: report.id,
    reason: report.reason,
    note: report.note ?? null,
  }))
  return {
    contextHash: sha256({ reportCount, reports: normalizedReports }),
    reportCount,
    noteHash: sha256(normalizedReports.map(report => ({ id: report.id, note: report.note }))),
    maxReasonRank: normalizedReports.reduce(
      (max, report) => Math.max(max, reportReasonSeverityRank(report.reason)),
      0,
    ),
  }
}

function sha256(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
