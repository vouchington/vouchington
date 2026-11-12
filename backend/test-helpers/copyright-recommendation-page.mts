import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { deleteChildPage } from '../services/copyright-notices/operational-retention-email-intake-operations.mts'

/** Exercise one actual bounded recommendation page without a scheduled sweep's SSI contention. */
export async function deleteCopyrightRecommendationPageForTest(
  intakeId: string,
  limit: number,
): Promise<number> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* enableCopyrightRecommendationPageForTest */
    SELECT set_config('app.copyright_operational_retention', 'on', true)`)
  const deleted = await deleteChildPage(
    transaction,
    intakeId,
    limit,
    'copyright_notice_email_intake_recommendations',
  )
  await transaction.commit()
  return deleted
}
