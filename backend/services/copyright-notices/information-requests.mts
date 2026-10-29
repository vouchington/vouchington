import { lockCopyrightNoticeLifetime } from './notice-lifetime.mts'
import { openCopyrightOwnerSecretBatch } from './encryption-key-batch.mts'
import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { createOutboundCopyrightCorrespondence } from './correspondence.mts'
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
  // ast-grep-ignore: no-three-sequential-awaits -- The transaction owns the case lifetime before the owner row and capability child locks.
  await using transaction = await beginTransaction()
  await lockCopyrightNoticeLifetime(transaction, input.noticeId)
  await using scopes = await openCopyrightOwnerSecretBatch(
    [{ kind: 'notice', id: input.noticeId }],
    transaction,
  )
  const { rows } = await transaction<{ id: string }>(
    sql`/* requestCopyrightGuestInformation:capability */
    SELECT id FROM copyright_notice_guest_capabilities
    WHERE id = ${input.capabilityId} AND copyright_notice_id = ${input.noticeId}
    FOR UPDATE
  `,
  )
  assert(rows[0], 404, 'Copyright guest capability was not found')
  const claimantEmail = await getCopyrightClaimantEmail(input.noticeId, transaction, scopes)
  assert(claimantEmail, 422, 'Copyright notice has no claimant email address to contact')
  const correspondenceId = uuidv7()
  // ast-grep-ignore: no-three-sequential-awaits -- The correspondence ID must exist before its delivery FK, and both obligations precede the commit.
  const correspondence = await createOutboundCopyrightCorrespondence(
    {
      id: correspondenceId,
      noticeId: input.noticeId,
      submissionId: null,
      correspondenceKind: 'request_information',
      compositionKind: 'staff',
      bodyText: input.statement,
      draftedById: input.currentUser.id,
    },
    transaction,
    scopes,
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
    scopes,
  )
  await transaction.commit()
  return { id: correspondence.id }
}
