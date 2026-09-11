import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  type ModerationReportEntityType,
  ENTITY_TYPE_TO_REPORT_FK,
  reportEntityFkColumn,
} from './config.mts'
import { appendUuidList } from './clustered-utils.mts'
import { openOrGetOpenCase } from '@services/moderation-cases'
import {
  getReportJudgementContextForEntity,
  type ReportJudgementContext,
} from './judgement-context.mts'

import type { ModerationJudgementAction } from '@ts-shared/utils/moderation-policy'
export type { ModerationJudgementAction }

export interface ModerationReportJudgement {
  id: string
  case_id: string | null
  entity_type: ModerationReportEntityType
  entity_id: string
  triggering_report_id: string | null
  rerun_by_id: string | null
  recommended_action: ModerationJudgementAction
  public_response: string
  internal_response: string
  model: string
  context_hash: string | null
  context_report_count: number | null
  context_note_hash: string | null
  context_max_reason_rank: number | null
  created_at: Date
  dispatched_at?: Date | null
}

export type InsertReportJudgementInput = {
  entityType: ModerationReportEntityType
  entityId: string
  caseId?: string | null
  triggeringReportId?: string | null
  rerunById?: string | null
  recommendedAction: ModerationJudgementAction
  publicResponse: string
  internalResponse: string
  model: string
  context?: ReportJudgementContext
}

export async function insertReportJudgement(
  input: InsertReportJudgementInput,
): Promise<ModerationReportJudgement> {
  let resolvedCaseId = input.caseId
  if (!resolvedCaseId && input.triggeringReportId) {
    const { rows: reportRows } = await read<{ case_id: string | null }>(
      sql`/* insertReportJudgement:caseId */ SELECT case_id FROM moderation_reports WHERE id = ${input.triggeringReportId}::uuid LIMIT 1`,
    )
    resolvedCaseId = reportRows[0]?.case_id ?? null
  }
  if (!resolvedCaseId) {
    resolvedCaseId = await openOrGetOpenCase({
      entityType: input.entityType,
      entityId: input.entityId,
    })
  }
  const context =
    input.context ?? (await getReportJudgementContextForEntity(input.entityType, input.entityId))
  const fkColumn = reportEntityFkColumn(input.entityType)
  const query = sql`/* insertReportJudgement */ INSERT INTO moderation_report_judgements (`
  query.append(fkColumn)
  query.append(
    sql`, case_id, triggering_report_id, rerun_by_id, recommended_action, public_response, internal_response, model, context_hash, context_report_count, context_note_hash, context_max_reason_rank) VALUES (${input.entityId}::uuid, ${resolvedCaseId}, ${input.triggeringReportId ?? null}, ${input.rerunById ?? null}, ${input.recommendedAction}, ${input.publicResponse}, ${input.internalResponse}, ${input.model}, ${context.contextHash}, ${context.reportCount}, ${context.noteHash}, ${context.maxReasonRank}) RETURNING id, case_id, triggering_report_id, rerun_by_id, recommended_action, public_response, internal_response, model, context_hash, context_report_count, context_note_hash, context_max_reason_rank, created_at, `,
  )
  query.append(fkColumn)
  query.append(
    sql` AS entity_id, ${input.entityType}::moderation_report_entity_type AS entity_type`,
  )

  const { rows } = await write(query)
  return rows[0] as ModerationReportJudgement
}

export async function getLatestJudgementForEntity(
  entityType: ModerationReportEntityType,
  entityId: string,
): Promise<ModerationReportJudgement | null> {
  const fkColumn = reportEntityFkColumn(entityType)
  const query = sql`/* getLatestJudgementForEntity */ SELECT id, case_id, triggering_report_id, rerun_by_id, recommended_action, public_response, internal_response, model, context_hash, context_report_count, context_note_hash, context_max_reason_rank, created_at, `
  query.append(fkColumn)
  query.append(sql` AS entity_id, ${entityType}::moderation_report_entity_type AS entity_type`)
  query.append(sql` FROM moderation_report_judgements WHERE `)
  query.append(fkColumn)
  query.append(sql` = ${entityId}::uuid ORDER BY created_at DESC, id DESC LIMIT 1`)

  const { rows } = await read(query)
  return (rows[0] as ModerationReportJudgement | undefined) ?? null
}

export async function getLatestJudgementsForEntitiesBatch(
  entities: Array<{ entityType: ModerationReportEntityType; entityId: string }>,
): Promise<Map<string, ModerationReportJudgement>> {
  if (entities.length === 0) return new Map()

  const byFk = new Map<string, { entityType: ModerationReportEntityType; ids: string[] }>()
  for (const e of entities) {
    const fkColumn = reportEntityFkColumn(e.entityType)
    const existing = byFk.get(fkColumn)
    if (existing) {
      existing.ids.push(e.entityId)
    } else {
      byFk.set(fkColumn, { entityType: e.entityType, ids: [e.entityId] })
    }
  }

  const subqueries = [...byFk.entries()].map(([fkColumn, { entityType, ids }], index) => {
    const subquery = sql`SELECT * FROM (
      SELECT DISTINCT ON (j.`
    subquery.append(fkColumn)
    subquery.append(
      sql`) j.id, j.case_id, j.triggering_report_id, j.rerun_by_id, j.recommended_action, j.public_response, j.internal_response, j.model, j.context_hash, j.context_report_count, j.context_note_hash, j.context_max_reason_rank, j.created_at, j.`,
    )
    subquery.append(fkColumn)
    subquery.append(sql` AS entity_id, `)
    if (fkColumn === ENTITY_TYPE_TO_REPORT_FK.post) {
      subquery.append(
        sql`CASE
          WHEN _jp.post_type = 'comment' THEN 'comment'::moderation_report_entity_type
          ELSE 'post'::moderation_report_entity_type
        END AS entity_type`,
      )
    } else {
      subquery.append(sql`${entityType}::moderation_report_entity_type AS entity_type`)
    }
    subquery.append(sql` FROM moderation_report_judgements j`)
    if (fkColumn === ENTITY_TYPE_TO_REPORT_FK.post) {
      subquery.append(sql` LEFT JOIN posts _jp ON _jp.id = j.post_id`)
    }
    subquery.append(sql` WHERE j.`)
    subquery.append(fkColumn)
    subquery.append(sql` IN (`)
    appendUuidList(subquery, ids)
    subquery.append(sql`) ORDER BY j.`)
    subquery.append(fkColumn)
    subquery.append(sql`, j.created_at DESC
    , j.id DESC
    ) latest_judgement_`)
    subquery.append(String(index))
    return subquery
  })

  const query = subqueries.reduce((combined, subquery) => {
    const next = sql``
    next.append(combined)
    next.append(sql` UNION ALL `)
    next.append(subquery)
    return next
  })

  const { rows } = await read(query)
  const result = new Map<string, ModerationReportJudgement>()
  for (const row of rows as ModerationReportJudgement[]) {
    result.set(`${row.entity_type}:${row.entity_id}`, row)
  }
  return result
}
