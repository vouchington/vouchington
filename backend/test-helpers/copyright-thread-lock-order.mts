import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Match promotion's row lock while a second connection holds its thread token. */
export async function lockTestCopyrightEmailIntakeForPromotion(
  intakeId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockTestCopyrightEmailIntakeForPromotion */
    SELECT id FROM copyright_notice_email_intakes
    WHERE id = ${intakeId} FOR NO KEY UPDATE
  `)
}
