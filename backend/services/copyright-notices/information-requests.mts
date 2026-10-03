import { beginTransaction } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import {
  copyrightCorrespondencePurpose,
  createOutboundCopyrightCorrespondence,
} from './correspondence.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { getCopyrightClaimantEmail } from './claimant-email.mts'

/**
 * Records a staff request for more information and queues it to the claimant on the notice. A
 * deficient notice obliges the provider to attempt contact with the claimant (17 U.S.C.
 * 512(c)(3)(B)(ii)), so the message and its delivery commit together or not at all. The delivery
 * sweep sends it; the text is stored encrypted and never logged.
 */
export async function requestCopyrightGuestInformation(input: {
  currentUser: PrivateUser
  noticeId: string
  capabilityId: string
  statement: string
}): Promise<{ id: string }> {
  assert(input.statement.trim().length > 0, 422, 'Information request is required')
  assert(
    currentUserCanReviewCopyrightNotices(input.currentUser),
    403,
    'Only copyright staff can request information',
  )
  await using transaction = await beginTransaction()
  const { rows } = await transaction<{ id: string }>(
    sql`/* requestCopyrightGuestInformation:capability */
    SELECT id FROM copyright_notice_guest_capabilities
    WHERE id = ${input.capabilityId} AND copyright_notice_id = ${input.noticeId}
    FOR UPDATE
  `,
  )
  assert(rows[0], 404, 'Copyright guest capability was not found')
  const claimantEmail = await getCopyrightClaimantEmail(input.noticeId, transaction)
  assert(claimantEmail, 422, 'Copyright notice has no claimant email address to contact')
  const correspondenceId = uuidv7()
  const correspondence = await createOutboundCopyrightCorrespondence(
    {
      id: correspondenceId,
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceKind: 'request_information',
      compositionKind: 'staff',
      bodyCiphertext: encryptSecret(
        input.statement,
        copyrightCorrespondencePurpose(correspondenceId),
      ),
      draftedById: input.currentUser.id,
    },
    transaction,
  )
  await createCopyrightDeliveryIntent(
    {
      noticeId: input.noticeId,
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
