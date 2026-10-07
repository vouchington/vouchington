import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The audit rows that name a delivery intent as the replayed delivery, oldest first. */
export async function readTestCopyrightDeliveryIntentReplayEvents(intentId: string): Promise<
  Array<{
    copyright_notice_id: string | null
    change_type: string
    changed_by_id: string | null
  }>
> {
  const { rows } = await read<{
    copyright_notice_id: string | null
    change_type: string
    changed_by_id: string | null
  }>(sql`/* readTestCopyrightDeliveryIntentReplayEvents */
    SELECT copyright_notice_id, change_type, changed_by_id
    FROM copyright_notice_lifecycle_changes
    WHERE copyright_notice_delivery_work_item_id = ${intentId}
    ORDER BY id
  `)
  return rows
}

/** What a replay resets and what it must leave alone, read straight from the intent row. */
export async function readTestCopyrightDeliveryIntentReplayFacts(intentId: string): Promise<{
  state: string
  attempt_count: number
  failed_at: Date | null
  body_ciphertext: string | null
}> {
  const { rows } = await read<{
    state: string
    attempt_count: number
    failed_at: Date | null
    body_ciphertext: string | null
  }>(sql`/* readTestCopyrightDeliveryIntentReplayFacts */
    SELECT state, attempt_count, failed_at, body_ciphertext
    FROM copyright_notice_delivery_work_items
    WHERE id = ${intentId}
  `)
  return rows[0]!
}
