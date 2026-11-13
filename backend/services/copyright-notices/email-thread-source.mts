import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function hasLiveCopyrightEmailSource(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<boolean> {
  const { rows } = await transaction(sql`/* recordCopyrightEmailThreadReferences:liveIntake */
    SELECT 1 FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_receipts receipt ON receipt.id = intake.id
    WHERE intake.id = ${intakeId} AND intake.raw_storage_object_id IS NOT NULL
      AND receipt.erased_at IS NULL LIMIT 1`)
  return rows.length > 0
}

export async function hasRetiredCopyrightEmailCaseLink(
  transaction: TransactionQuery,
  intakeId: string,
): Promise<boolean> {
  const { rows: links } = await transaction<{ copyright_notice_id: string }>(sql`
    /* recordCopyrightEmailThreadReferences:caseLink */
    SELECT copyright_notice_id FROM copyright_notice_email_intake_notice_links
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  if (!links[0]) return false
  return readCopyrightThreadRetirement(transaction, [links[0].copyright_notice_id])
}
