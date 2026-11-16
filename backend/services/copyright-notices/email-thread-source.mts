import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Retained ancestry is historical evidence, not authority to route through retired sources. */
export async function hasRetiredCopyrightEmailThreadIntakes(
  transaction: TransactionQuery,
  intakeIds: readonly string[],
): Promise<boolean> {
  if (intakeIds.length === 0) return false
  const { rows } = await transaction(sql`/* hasRetiredCopyrightEmailThreadIntakes */
    SELECT 1
    FROM unnest(${[...intakeIds]}::uuid[]) source(intake_id)
    JOIN copyright_notice_email_intake_notice_links link
      ON link.copyright_notice_email_intake_id = source.intake_id
    JOIN copyright_notice_thread_retention_activities retirement
      ON retirement.copyright_notice_id = link.copyright_notice_id
    WHERE retirement.retired_before_intake_bound > source.intake_id
    LIMIT 1`)
  return rows.length > 0
}

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
  const { rows: retired } = await transaction(sql`/* recordCopyrightEmailThreadReferences:retired */
    SELECT 1 FROM copyright_notice_thread_retention_activities
    WHERE copyright_notice_id = ${links[0].copyright_notice_id}
      AND retired_before_intake_bound > ${intakeId}::uuid LIMIT 1`)
  return retired.length > 0
}
