import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret, hashToken } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { readCopyrightThreadRetirement } from '@data-stores/psql/copyright-preservation-coverage'
import { copyrightGuestCapabilityPurpose } from '../services/copyright-notices/guest-capabilities.mts'
import { getCopyrightClaimantEmail } from '../services/copyright-notices/claimant-email.mts'
import {
  copyrightCorrespondencePurpose,
  createOutboundCopyrightCorrespondence,
} from '../services/copyright-notices/correspondence.mts'
import { createCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intents.mts'
import { createTestCopyrightStaff } from './services/copyright-notices/guest-capability.mts'

/** A complete committed information request before the real SES processor subject runs. */
export async function seedTestCopyrightInformationRequest(noticeId: string, statement: string) {
  const staff = await createTestCopyrightStaff()
  const now = new Date()
  const capabilityId = uuidv7({ msecs: now.getTime() })
  const token = randomBytes(32).toString('base64url')
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{
    id: string
  }>(sql`/* seedTestCopyrightInformationRequest:identity */
    INSERT INTO copyright_notice_guest_capability_identities (id, copyright_notice_id)
    SELECT ${capabilityId}, id FROM copyright_notices WHERE id = ${noticeId} RETURNING id`)
  if (!rows[0]) throw new Error('Owned information-request notice disappeared')
  await transaction(sql`/* seedTestCopyrightInformationRequest:capability */
    INSERT INTO copyright_notice_guest_capabilities
      (id, copyright_notice_id, token_hash, issued_by_id, expires_at)
    VALUES (${capabilityId}, ${noticeId}, ${hashToken(copyrightGuestCapabilityPurpose, token)},
      ${staff.id}, ${new Date(now.getTime() + 60 * 60 * 1000)})`)
  await transaction(sql`/* seedTestCopyrightInformationRequest:event */
    INSERT INTO copyright_notice_lifecycle_changes
      (copyright_notice_id, change_type, changed_by_id, copyright_notice_guest_capability_id)
    VALUES (${noticeId}, 'guest_capability_issued', ${staff.id}, ${capabilityId})`)
  const claimantEmail = await getCopyrightClaimantEmail(noticeId, transaction)
  if (!claimantEmail) throw new Error('Owned information request has no claimant email')
  await readCopyrightThreadRetirement(transaction, [noticeId])
  const id = uuidv7()
  const correspondence = await createOutboundCopyrightCorrespondence(
    {
      id,
      noticeId,
      submissionId: null,
      correspondenceKind: 'request_information',
      compositionKind: 'staff',
      bodyCiphertext: encryptSecret(statement, copyrightCorrespondencePurpose(id)),
      draftedById: staff.id,
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId,
      submissionId: null,
      correspondenceId: correspondence.id,
      recipientUserId: null,
      recipientRole: 'claimant',
      deliveryKind: 'staff_information_request',
      channel: 'email',
      idempotencyKey: `copyright-correspondence:${correspondence.id}:claimant-information-request`,
      recipientEmail: claimantEmail,
    },
    transaction,
  )
  await transaction.commit()
  return { id: correspondence.id }
}
