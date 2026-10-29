import { v7 as uuidv7 } from 'uuid'
import { beginTransaction, read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCopyrightRetentionWindows } from '../services/copyright-notices/config.mts'
import {
  attachCopyrightEncryptionKey,
  prepareCopyrightEncryptionKey,
} from '../services/copyright-notices/encryption-keys.mts'
import { createTestUserDirect } from './entities/users.mts'

const HISTORICAL_AT = new Date('2000-01-01T00:00:00.000Z')

export type CopyrightDeliveryActivityFixture = {
  noticeId: string
  deliveryId: string
}

/** A valid old notice/key/recipient graph with an old UUIDv7 delivery to claim and send. */
export async function createCopyrightDeliveryActivityFixture(): Promise<CopyrightDeliveryActivityFixture> {
  const noticeId = uuidv7({ msecs: HISTORICAL_AT.getTime() })
  const deliveryId = uuidv7({ msecs: HISTORICAL_AT.getTime() })
  const [recipientResult, keyResult] = await Promise.allSettled([
    createTestUserDirect(),
    prepareCopyrightEncryptionKey('notice'),
  ])
  if (recipientResult.status === 'rejected') {
    if (keyResult.status === 'fulfilled') await keyResult.value[Symbol.asyncDispose]()
    throw recipientResult.reason
  }
  if (keyResult.status === 'rejected') throw keyResult.reason
  const recipient = recipientResult.value
  await using key = keyResult.value
  await using transaction = await beginTransaction()
  const owner = { kind: 'notice' as const, id: noticeId }
  await attachCopyrightEncryptionKey(key, owner, transaction)
  await transaction(sql`/* createCopyrightDeliveryActivityNotice */
    INSERT INTO copyright_notices (
      id, jurisdiction, legal_basis, received_at, claimant_user_id, claimant_display_name,
      claimant_contact_ciphertext, work_description, policy_version, updated_at
    ) VALUES (
      ${noticeId}, 'us_dmca', 'copyright', ${HISTORICAL_AT}, ${recipient.id},
      'Historical claimant', ${key.encrypt(`contact-${noticeId}`, `delivery-activity:${noticeId}:contact`, owner)},
      'Historical work', 'retention-delivery-activity-test', ${HISTORICAL_AT}
    )`)
  await transaction(sql`/* createCopyrightDeliveryActivityNoticeEvent */
    INSERT INTO copyright_notice_lifecycle_changes (id, copyright_notice_id, change_type)
    VALUES (${uuidv7({ msecs: HISTORICAL_AT.getTime() })}, ${noticeId}, 'notice_received')`)
  await transaction(sql`/* createCopyrightDeliveryActivityIntent */
    INSERT INTO copyright_notice_delivery_work_items (
      id, copyright_notice_id, recipient_user_id, recipient_role, delivery_kind,
      channel, idempotency_key, available_at, updated_at
    ) VALUES (
      ${deliveryId}, ${noticeId}, ${recipient.id}, 'claimant', 'claimant_receipt',
      'in_app', ${`delivery-activity-${crypto.randomUUID()}`}, ${HISTORICAL_AT}, ${HISTORICAL_AT}
    )`)
  await transaction.commit()
  return { noticeId, deliveryId }
}

export async function readCopyrightDeliveryActivityState(
  fixture: CopyrightDeliveryActivityFixture,
): Promise<{ legalClock: Date; updatedAt: Date; sentAt: Date | null }> {
  const { rows } = await read<{ legal_clock: Date; updated_at: Date; sent_at: Date | null }>(sql`
    /* readCopyrightDeliveryActivityState */
    SELECT fn_project_copyright_minimal_record_legal_clock(notice.id,
      ${getCopyrightRetentionWindows().complaintMonths}) AS legal_clock,
      delivery.updated_at, delivery.sent_at
    FROM copyright_notices notice
    JOIN copyright_notice_delivery_work_items delivery ON delivery.copyright_notice_id = notice.id
    WHERE notice.id = ${fixture.noticeId} AND delivery.id = ${fixture.deliveryId}`)
  const state = rows[0]
  if (!state) throw new Error('Copyright delivery activity fixture disappeared')
  return { legalClock: state.legal_clock, updatedAt: state.updated_at, sentAt: state.sent_at }
}
