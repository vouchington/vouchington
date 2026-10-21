import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  claimApiKeyExpiryReminder,
  getApiKeyExpiryReminderDetails,
  getApiKeysDueForExpiryReminder,
} from '../../services/api-keys/expiry-reminders.mts'
import { getApiKeyExpiryLimits } from '../../services/api-keys/work-limits.mts'

/** Checks one owned key at a PostgreSQL cutoff without rounding its timestamp through JavaScript. */
export async function checkTestApiKeyReminderAtOffset(
  apiKeyId: string,
  edge: 'now' | 'seven-days',
  offsetMs: number,
): Promise<{ due: boolean; details: boolean; claimed: boolean; claimedAgain: boolean }> {
  await using transaction = await beginTransaction()
  const base = edge === 'now' ? sql`CURRENT_TIMESTAMP` : sql`CURRENT_TIMESTAMP + INTERVAL '7 days'`
  await transaction(
    sql`/* checkTestApiKeyReminderAtOffset */
    UPDATE api_keys
    SET expires_at = `.append(base).append(sql` + ${offsetMs}::bigint * INTERVAL '1 millisecond'
    WHERE id = ${apiKeyId}::uuid
  `),
  )
  const options = { query: transaction }
  const { batchSize, maxBatches } = getApiKeyExpiryLimits()
  let afterId: string | undefined
  let due = false
  let exhausted = false
  for (let batch = 0; batch < maxBatches; batch++) {
    const dueIds = await getApiKeysDueForExpiryReminder(afterId, batchSize, options)
    if (dueIds.includes(apiKeyId)) due = true
    if (due || dueIds.length < batchSize || (dueIds.at(-1) ?? '') >= apiKeyId) {
      exhausted = true
      break
    }
    afterId = dueIds.at(-1)
  }
  if (!exhausted) throw new Error('API key reminder test exhausted its normal bounded keyset scan')
  // oxlint-disable-next-line react-doctor/async-parallel -- Read pre-claim state, then verify first and repeated claims in order.
  const details = await getApiKeyExpiryReminderDetails(apiKeyId, options)
  const claimed = await claimApiKeyExpiryReminder(apiKeyId, options)
  const claimedAgain = await claimApiKeyExpiryReminder(apiKeyId, options)
  return { due, details: details !== null, claimed, claimedAgain }
}
