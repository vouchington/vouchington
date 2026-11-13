import { expect } from 'vitest'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { decryptSecret } from '@modules/token-secrets'
import type { prepareCopyrightEmailDelivery } from '../services/copyright-notices/delivery-transport.mts'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { readCopyrightCaseLifecycleClock } from './copyright-lifecycle-clock.mts'
import { readTestCopyrightDeliveryAttempts } from './copyright-attempt-history.mts'

type Envelope = Awaited<ReturnType<typeof prepareCopyrightEmailDelivery>>
export async function readOwnedCopyrightMailWork(intentId: string) {
  const [{ rows: work }, { rows: recipients }, attempts] = await Promise.all([
    write<{
      id: string
      state: string
      attempt_count: number
      generation: string
      copyright_notice_id: string | null
      copyright_notice_correspondence_message_id: string | null
      delivery_kind: Envelope['deliveryKind']
      lease_token: string | null
      failure_ciphertext: string | null
    }>(sql`/* readOwnedCopyrightMailWork */
      SELECT * FROM copyright_notice_delivery_work_items WHERE id = ${intentId}`),
    write(sql`/* readOwnedCopyrightMailWork:recipient */ SELECT * FROM copyright_notice_delivery_recipients
      WHERE copyright_notice_delivery_work_item_id = ${intentId}`),
    readTestCopyrightDeliveryAttempts(intentId),
  ])
  const row = work[0]
  if (!row) throw new Error('Owned mail work is missing')
  return {
    work: row,
    recipients,
    attempts,
    failure: row.failure_ciphertext
      ? decryptSecret(row.failure_ciphertext, `copyright-delivery:${intentId}`)
      : null,
    aggregate: row.copyright_notice_id
      ? await getCopyrightNoticePrivateAggregate(row.copyright_notice_id)
      : null,
    clock: row.copyright_notice_id
      ? await readCopyrightCaseLifecycleClock(row.copyright_notice_id)
      : null,
  }
}

export function expectedOwnedMailClaim(
  before: Awaited<ReturnType<typeof readOwnedCopyrightMailWork>>,
) {
  return {
    ...before,
    work: {
      ...before.work,
      state: 'claimed',
      attempt_count: before.work.attempt_count + 1,
      lease_token: expect.any(String),
      leased_at: expect.any(Date),
      lease_expires_at: expect.any(Date),
      delivery_attempted_at: expect.any(Date),
      available_at: expect.any(Date),
      updated_at: expect.any(Date),
      failure_ciphertext: null,
    },
    failure: null,
    attempts: [
      ...before.attempts,
      {
        attempt_number: (before.attempts.at(-1)?.attempt_number ?? 0) + 1,
        generation: before.work.generation,
        sent: false,
        failed: false,
        abandoned: false,
      },
    ],
    aggregate: before.aggregate
      ? {
          ...before.aggregate,
          deliveryIntents: before.aggregate.deliveryIntents.map(row =>
            row.id === before.work.id
              ? { ...row, state: 'claimed', attempt_count: row.attempt_count + 1 }
              : row,
          ),
        }
      : null,
  }
}
