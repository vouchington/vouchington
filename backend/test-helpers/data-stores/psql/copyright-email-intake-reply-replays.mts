import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** The audit rows that name a delivery intent as the replayed delivery, oldest first. */
export async function readTestCopyrightDeliveryIntentReplayEvents(intentId: string): Promise<
  Array<{
    copyright_notice_id: string | null
    event_type: string
    actor_user_id: string | null
  }>
> {
  const { rows } = await read<{
    copyright_notice_id: string | null
    event_type: string
    actor_user_id: string | null
  }>(sql`/* readTestCopyrightDeliveryIntentReplayEvents */
    SELECT copyright_notice_id, event_type, actor_user_id
    FROM copyright_notice_lifecycle_events
    WHERE copyright_notice_delivery_intent_id = ${intentId}
    ORDER BY id
  `)
  return rows
}

/** What a replay resets and what it must leave alone, read straight from the intent row. */
export async function readTestCopyrightDeliveryIntentReplayFacts(intentId: string): Promise<{
  state: string
  delivery_attempt_count: number
  failed_at: Date | null
  body_ciphertext: string | null
}> {
  const { rows } = await read<{
    state: string
    delivery_attempt_count: number
    failed_at: Date | null
    body_ciphertext: string | null
  }>(sql`/* readTestCopyrightDeliveryIntentReplayFacts */
    SELECT state, delivery_attempt_count, failed_at, body_ciphertext
    FROM copyright_notice_delivery_intents
    WHERE id = ${intentId}
  `)
  return rows[0]!
}
