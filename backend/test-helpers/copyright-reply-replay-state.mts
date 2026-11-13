import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import { readTestCopyrightDeliveryAttempts } from './copyright-attempt-history.mts'
import { readTestCopyrightDeliveryIntentReplayEvents } from './data-stores/psql/copyright-email-intake-reply-replays.mts'
import { readCopyrightEmailIntakeNoticeLinks } from './data-stores/psql/copyright-email-intakes.mts'
import { copyrightStaffQueueKeysSql } from '../services/copyright-notices/read-models-staff-queue-sql.mts'

export async function readOwnedCopyrightReplyState(intakeId: string, intentId: string) {
  const [{ rows: work }, { rows: recipients }, { rows: receipt }, events, attempts, links] =
    await Promise.all([
      write<{
        id: string
        state: string
        generation: string
        attempt_count: number
        body_ciphertext: string
        lease_token: string | null
      }>(sql`
      /* readOwnedCopyrightReplyState:work */ SELECT * FROM copyright_notice_delivery_work_items WHERE id = ${intentId}`),
      write<{ copyright_notice_delivery_work_item_id: string; email_ciphertext: string }>(sql`
      /* readOwnedCopyrightReplyState:recipient */ SELECT * FROM copyright_notice_delivery_recipients
      WHERE copyright_notice_delivery_work_item_id = ${intentId}`),
      write(
        sql`/* readOwnedCopyrightReplyState:receipt */ SELECT * FROM copyright_notice_email_intake_receipts WHERE id = ${intakeId}`,
      ),
      readTestCopyrightDeliveryIntentReplayEvents(intentId),
      readTestCopyrightDeliveryAttempts(intentId),
      readCopyrightEmailIntakeNoticeLinks(intakeId),
    ])
  if (!work[0] || !recipients[0] || !receipt[0])
    throw new Error('Owned declined reply is incomplete')
  return { work: work[0], recipients, receipt, events, attempts, links }
}

export async function countOwnedCopyrightReplyQueueKeys(intakeId: string) {
  const { rows } = await write<{ count: number }>(
    sql`/* countOwnedCopyrightReplyQueueKeys */`.append(copyrightStaffQueueKeysSql())
      .append(sql`SELECT count(*)::int AS count FROM queue_key WHERE id IN (
      SELECT copyright_notice_id FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_id = ${intakeId})`),
  )
  return rows[0]!.count
}

export function ownedCopyrightReplyRecipient(
  state: Awaited<ReturnType<typeof readOwnedCopyrightReplyState>>,
) {
  const row = state.recipients[0]!
  return decryptSecret(
    row.email_ciphertext,
    `copyright-delivery-recipient:${row.copyright_notice_delivery_work_item_id}`,
  )
}
