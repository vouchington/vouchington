import { write, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import { openOrGetOpenCase } from '@services/moderation-cases'
import { type ModerationReport, reportEntityFkColumn } from './config.mts'
import type { CreateModerationReportInput } from './parse.mts'
import type { CreateModerationReportResult } from './create.mts'

/** The case and report share the transaction whose commit owns subsequent notifications. */
export async function insertModerationReport(
  currentUserId: string,
  provenance: ContentProvenance,
  input: CreateModerationReportInput,
  transaction: TransactionQuery,
): Promise<CreateModerationReportResult> {
  const caseId = await openOrGetOpenCase(
    { entityType: input.entityType, entityId: input.entityId },
    { query: transaction },
  )
  const fkColumn = reportEntityFkColumn(input.entityType)
  const query = sql`/* createModerationReport */ INSERT INTO moderation_reports (reporter_user_id, `
  query.append(fkColumn)
  query.append(
    sql`, case_id, reason, original_reason, note, created_via, created_via_oauth_client_id) VALUES (${currentUserId}, ${input.entityId}::uuid, ${caseId}, ${input.reason}, ${input.reason}, ${input.note}, ${provenance.createdVia}, ${provenance.oauthClientId}) ON CONFLICT (reporter_user_id, `,
  )
  query.append(fkColumn)
  query.append(sql`) WHERE reviewed_at IS NULL AND `)
  query.append(fkColumn)
  query.append(
    sql` IS NOT NULL DO UPDATE SET reason = EXCLUDED.reason, note = EXCLUDED.note RETURNING (xmax = 0) AS inserted, id, case_id, created_at, reviewed_at, reporter_user_id, reason, note, 'pending'::text AS status, resolved_by_id`,
  )

  const { rows } = await write(query, { query: transaction })

  const dbRow = rows[0] as
    | (Omit<ModerationReport, 'entity_type' | 'entity_id'> & { inserted: boolean })
    | undefined
  assert(dbRow, 500, 'Failed to fetch moderation report')
  const { inserted, ...rest } = dbRow
  const report: ModerationReport = {
    ...rest,
    entity_type: input.entityType,
    entity_id: input.entityId,
  }

  return { report, isDuplicate: !inserted }
}
