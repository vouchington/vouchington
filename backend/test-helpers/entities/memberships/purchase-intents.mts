import { write } from '../../fixture-executor.mts'
import sql from '../../fixture-sql.mts'

export async function markTestMembershipPurchaseIntentFailed(
  purchaseIntentId: string,
): Promise<void> {
  const { rowCount } = await write(sql`/* markTestMembershipPurchaseIntentFailed */
    UPDATE membership_purchase_intents
    SET launched_at = NULL, failed_at = CURRENT_TIMESTAMP, failure_code = 'test_failure'
    WHERE id = ${purchaseIntentId} AND failed_at IS NULL`)
  if (rowCount !== 1) throw new Error('Test membership purchase intent was not marked failed')
}
