import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { lockCopyrightActionGenerationForWrite } from './action-delivery-generation.mts'
import type { CopyrightActionIntentRecord } from './types.mts'

const MAX_ATTEMPTS = 5
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

export type CopyrightClaimedActionIntent = Pick<
  CopyrightActionIntentRecord,
  'id' | 'action' | 'expected_placement_revision'
> & {
  lease_token: string
  placement_id: string
  image_id: string
}

export async function claimCopyrightActionIntent(
  intentId: string,
  now: Date,
): Promise<CopyrightClaimedActionIntent | null> {
  await using transaction = await beginTransaction()
  const { rows: eligible } = await transaction<{ copyright_notice_id: string }>(sql`
    /* claimCopyrightActionIntent:eligible */
    SELECT copyright_notice_id FROM copyright_notice_action_work_items
    WHERE id = ${intentId} AND (
      (state = 'pending' AND attempt_count < ${MAX_ATTEMPTS} AND available_at <= ${now})
      OR (state = 'claimed' AND lease_expires_at <= ${now})
    )
  `)
  if (!eligible[0]) return null
  await lockCopyrightActionGenerationForWrite(eligible[0].copyright_notice_id, transaction)
  const { rowCount: exhausted } = await transaction(sql`/* claimCopyrightActionIntent:exhausted */
    UPDATE copyright_notice_action_work_items
    SET completed_at = ${now}, completed_at_reason = 'failed',
      failure_message = 'A claimed copyright action exceeded the maximum delivery attempts.',
      available_at = clock_timestamp()
    WHERE id = ${intentId} AND state = 'claimed'
      AND lease_expires_at <= ${now} AND attempt_count >= ${MAX_ATTEMPTS}
  `)
  if (exhausted) {
    await transaction.commit()
    return null
  }
  const { rows } = await transaction<CopyrightClaimedActionIntent>(sql`
    /* claimCopyrightActionIntent */
    UPDATE copyright_notice_action_work_items intent
    SET lease_token = uuidv7(), attempt_count = intent.attempt_count + 1,
      leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + ${CLAIM_TIMEOUT_MS} * interval '1 millisecond',
      available_at = clock_timestamp(), failure_message = NULL
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    JOIN copyright_notice_target_images target_image ON target_image.copyright_notice_target_id = target.id
    WHERE intent.id = ${intentId} AND intent.copyright_restriction_id = restriction.id
      AND intent.attempt_count < ${MAX_ATTEMPTS} AND (
        (intent.state = 'pending' AND intent.available_at <= ${now})
        OR (intent.state = 'claimed' AND intent.lease_expires_at <= ${now})
      )
    RETURNING intent.id, intent.lease_token, intent.action, intent.expected_placement_revision,
      target.placement_id, target_image.image_id
  `)
  if (!rows[0]) return null
  await transaction.commit()
  return rows[0]
}

/** Renewal only extends expiry, so its trigger does not write the blocker generation. */
export async function renewCopyrightActionIntentLease(
  intentId: string,
  leaseToken: string,
  query: TransactionQuery,
): Promise<boolean> {
  const { rowCount } = await query(sql`/* renewCopyrightActionIntentLease */
    UPDATE copyright_notice_action_work_items
    SET lease_expires_at = clock_timestamp() + ${CLAIM_TIMEOUT_MS} * interval '1 millisecond'
    WHERE id = ${intentId} AND state = 'claimed' AND lease_token = ${leaseToken}
      AND lease_expires_at > clock_timestamp()
  `)
  return rowCount === 1
}
