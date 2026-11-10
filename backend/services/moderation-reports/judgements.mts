import { beginTransaction, read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  type ModerationReportEntityType,
  ENTITY_TYPE_TO_REPORT_FK,
  reportEntityFkColumn,
} from './config.mts'
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
  is_context_report_count_capped: boolean
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
  runId?: string | null
  recommendedAction: ModerationJudgementAction
  publicResponse: string
  internalResponse: string
  model: string
  context?: ReportJudgementContext
}

export async function insertReportJudgement(
  input: InsertReportJudgementInput,
): Promise<ModerationReportJudgement> {
  if (input.runId && !input.triggeringReportId)
    throw new Error('A manual judgement run requires its triggering report')
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
    sql`, case_id, triggering_report_id, rerun_by_id, run_id, recommended_action, public_response, internal_response, model, context_hash, context_report_count, is_context_report_count_capped, context_note_hash, context_max_reason_rank) VALUES (${input.entityId}::uuid, ${resolvedCaseId}, ${input.triggeringReportId ?? null}, ${input.rerunById ?? null}, ${input.runId ?? null}::uuid, ${input.recommendedAction}, ${input.publicResponse}, ${input.internalResponse}, ${input.model}, ${context.contextHash}, ${context.reportCount}, ${context.reportCountCapped}, ${context.noteHash}, ${context.maxReasonRank}) RETURNING id, case_id, triggering_report_id, rerun_by_id, recommended_action, public_response, internal_response, model, context_hash, context_report_count, is_context_report_count_capped, context_note_hash, context_max_reason_rank, created_at, `,
  )
  query.append(fkColumn)
  query.append(
    sql` AS entity_id, ${input.entityType}::moderation_report_entity_types AS entity_type`,
  )

  if (!input.runId) {
    const { rows } = await write<ModerationReportJudgement>(query)
    return rows[0]
  }

  // The saved judgement and its run outcome become visible in one commit.
  await using transaction = await beginTransaction()
  const { rows } = await transaction<ModerationReportJudgement>(query)
  const completion = await transaction(sql`/* insertReportJudgement:completeRun */
    UPDATE moderation_report_judgement_runs
    SET completed_at = now()
    WHERE id = ${input.runId}::uuid
      AND moderation_report_id = ${input.triggeringReportId ?? null}::uuid
    RETURNING id
  `)
  if (completion.rowCount !== 1) throw new Error('Judgement run disappeared before completion')
  await transaction.commit()
  return rows[0]
}

export async function getLatestJudgementForEntity(
  entityType: ModerationReportEntityType,
  entityId: string,
): Promise<ModerationReportJudgement | null> {
  const fkColumn = reportEntityFkColumn(entityType)
  const query = sql`/* getLatestJudgementForEntity */ SELECT id, case_id, triggering_report_id, rerun_by_id, recommended_action, public_response, internal_response, model, context_hash, context_report_count, is_context_report_count_capped, context_note_hash, context_max_reason_rank, created_at, `
  query.append(fkColumn)
  query.append(sql` AS entity_id, ${entityType}::moderation_report_entity_types AS entity_type`)
  query.append(sql` FROM moderation_report_judgements WHERE `)
  query.append(fkColumn)
  query.append(sql` = ${entityId}::uuid ORDER BY id DESC LIMIT 1`)

  const { rows } = await read<ModerationReportJudgement>(query)
  return rows[0] ?? null
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
      if (!existing.ids.includes(e.entityId)) existing.ids.push(e.entityId)
    } else {
      byFk.set(fkColumn, { entityType: e.entityType, ids: [e.entityId] })
    }
  }

  const subqueries = [...byFk.entries()].map(([fkColumn, { entityType, ids }]) => {
    const subquery = sql`SELECT j.id, j.case_id, j.triggering_report_id, j.rerun_by_id,
      j.recommended_action, j.public_response, j.internal_response, j.model, j.context_hash,
      j.context_report_count, j.is_context_report_count_capped, j.context_note_hash,
      j.context_max_reason_rank, j.created_at, entity.id AS entity_id, `
    if (fkColumn === ENTITY_TYPE_TO_REPORT_FK.post) {
      subquery.append(sql`CASE WHEN p.post_type = 'comment' THEN 'comment'::moderation_report_entity_types
        ELSE 'post'::moderation_report_entity_types END AS entity_type`)
    } else {
      subquery.append(sql`${entityType}::moderation_report_entity_types AS entity_type`)
    }
    subquery.append(sql` FROM unnest(${ids}::uuid[]) entity(id)
      JOIN LATERAL (SELECT * FROM moderation_report_judgements j WHERE j.`)
    subquery.append(fkColumn)
    subquery.append(sql` = entity.id ORDER BY j.id DESC LIMIT 1) j ON true`)
    if (fkColumn === ENTITY_TYPE_TO_REPORT_FK.post) {
      subquery.append(sql` LEFT JOIN posts p ON p.id = entity.id`)
    }
    return subquery
  })

  const query = sql`/* getLatestJudgementsForEntitiesBatch */`.append(
    subqueries.reduce((combined, subquery) => {
      const next = sql``
      next.append(combined)
      next.append(sql` UNION ALL `)
      next.append(subquery)
      return next
    }),
  )

  const { rows } = await read<ModerationReportJudgement>(query)
  const result = new Map<string, ModerationReportJudgement>()
  for (const row of rows) {
    result.set(`${row.entity_type}:${row.entity_id}`, row)
  }
  return result
}
