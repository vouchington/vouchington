import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  type ModerationReportEntityType,
  type ModerationReportReason,
  reportEntityFkColumn,
} from './config.mts'
import { MAX_REPORTS_FOR_JUDGEMENT } from './judgement-context.mts'

export async function getAllReportsForEntity(
  entityType: ModerationReportEntityType,
  entityId: string,
): Promise<
  Array<{ id: string; reason: ModerationReportReason; note: string | null; created_at: Date }>
> {
  // Bound to the most recent reports so a heavily-reported entity cannot blow the model
  // context window or make a manual re-run unexpectedly expensive.
  const fkColumn = reportEntityFkColumn(entityType)
  const query = sql`/* getAllReportsForEntity */ SELECT id, reason, note, created_at FROM moderation_reports WHERE `
  query.append(fkColumn)
  query.append(
    sql` = ${entityId}::uuid ORDER BY created_at DESC, id DESC LIMIT ${MAX_REPORTS_FOR_JUDGEMENT}`,
  )
  const { rows } = await read(query)
  return rows as Array<{
    id: string
    reason: ModerationReportReason
    note: string | null
    created_at: Date
  }>
}
