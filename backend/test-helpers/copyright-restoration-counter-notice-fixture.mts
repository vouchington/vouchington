import { createHash, randomUUID } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { encryptSecret } from '@modules/token-secrets'
import { copyrightPlacementPartiesSql } from '@data-stores/psql/copyright-placement-parties'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import {
  copyrightSubmissionPurpose,
  type CopyrightCounterNoticeInput,
} from '../services/copyright-notices/submissions.mts'
import { advanceCopyrightLastLegalActivityAt } from '../services/copyright-notices/last-legal-activity.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import type { CopyrightNoticeSubmissionRecord } from '../services/copyright-notices/types.mts'
import type { PrivateUser } from '../services/users/types.mts'

/** A committed counter-notice dependency with its current request receipt, scope, audit and status. */
export async function seedRestorationCounterNotice(
  claimant: PrivateUser,
  noticeId: string,
  targetIds: string[],
) {
  if (targetIds.length === 0 || new Set(targetIds).size !== targetIds.length)
    throw new Error('Restoration counter-notice needs unique owned targets')
  const id = uuidv7()
  const key = randomUUID()
  const input: CopyrightCounterNoticeInput = {
    name: 'Poster',
    address: '1 Main Street',
    telephone: '555-0100',
    consentToFederalJurisdiction: true,
    consentToServiceOfProcess: true,
    goodFaithMisidentificationUnderPenaltyOfPerjury: true,
    electronicSignature: 'Poster',
    targetIds,
  }
  await using transaction = await beginTransaction()
  const ownership = sql`/* seedRestorationCounterNotice:ownership */ SELECT target.id
    FROM copyright_notice_targets target CROSS JOIN LATERAL `
  ownership.append(copyrightPlacementPartiesSql('respond')).append(sql` party
    WHERE target.copyright_notice_id = ${noticeId} AND target.id = ANY(${targetIds}::uuid[])
      AND party.user_id = ${claimant.id}`)
  const { rows: owned } = await transaction<{ id: string }>(ownership)
  if (owned.length !== targetIds.length)
    throw new Error('Restoration counter-notice targets were not owned')
  await readCopyrightThreadRetirement(transaction, [noticeId])
  const { rows } =
    await transaction<CopyrightNoticeSubmissionRecord>(sql`/* seedRestorationCounterNotice */
    INSERT INTO copyright_notice_submissions (id, copyright_notice_id, kind, received_at, source_kind,
      submitted_by_id, body_ciphertext) VALUES (${id}, ${noticeId}, 'counter_notice', CURRENT_TIMESTAMP,
      'signed_in_form', ${claimant.id}, ${encryptSecret(JSON.stringify(input), copyrightSubmissionPurpose(id))})
    RETURNING id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext`)
  const submission = rows[0]
  if (!submission) throw new Error('Restoration counter-notice disappeared')
  await transaction(sql`/* seedRestorationCounterNotice:targets */
    INSERT INTO copyright_notice_submission_targets (copyright_notice_submission_id, copyright_notice_target_id)
    SELECT ${id}, unnest(${targetIds}::uuid[])`)
  await transaction(sql`/* seedRestorationCounterNotice:receipt */
    INSERT INTO copyright_notice_submission_requests (copyright_notice_submission_id, requester_user_id,
      idempotency_key_sha256, request_sha256)
    VALUES (${id}, ${claimant.id}, ${createHash('sha256').update(key).digest()},
      ${createHash('sha256')
        .update(JSON.stringify({ kind: 'counter_notice', input }))
        .digest()})`)
  await transaction(sql`/* seedRestorationCounterNotice:event */
    INSERT INTO copyright_notice_lifecycle_changes (copyright_notice_id, change_type, changed_by_id,
      copyright_notice_submission_id) VALUES (${noticeId}, 'counter_notice_received', ${claimant.id}, ${id})`)
  await advanceCopyrightLastLegalActivityAt(transaction, { noticeId })
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: id,
      correspondenceId: null,
      recipientUserId: claimant.id,
      recipientRole: 'poster',
      deliveryKind: 'status_update',
      channel: 'in_app',
      idempotencyKey: `copyright-submission:${id}:poster-receipt`,
    },
    transaction,
  )
  await transaction.commit()
  return { submission, isDuplicate: false }
}
