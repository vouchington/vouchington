import { createHash } from 'node:crypto'
import { beginTransaction } from '@data-stores/psql'
import { encryptSecret, hashToken } from '@modules/token-secrets'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createCopyrightNoticeAggregateInTransaction } from './create.mts'
import { createCopyrightDeliveryIntent } from './delivery-intents.mts'
import { createCopyrightFormReceiptInTransaction } from './form-intake-receipt.mts'
import type { CopyrightJurisdiction, CopyrightNoticeTargetInput } from './types.mts'
import {
  claimantCanViewCopyrightImagePlacement,
  resolveCopyrightImagePlacement,
  type CopyrightImageSelector,
} from './placement-resolution.mts'
import { assertStructuredNoticeStatutoryFields } from './form-input-validation.mts'

export type CreateCopyrightFormIntakeInput = {
  currentUser: PrivateUser | null
  requesterIdentity: string
  idempotencyKey: string
  request: {
    jurisdiction: CopyrightJurisdiction
    claimantDisplayName: string | null
    claimantContact: string
    claimantEmail: string
    workDescription: string
    goodFaithBelief: boolean
    accuracyAuthorityUnderPenaltyOfPerjury: boolean
    electronicSignature: string
    claimantTargets: CopyrightImageSelector[]
  }
}

export type CopyrightFormIntakeRecord = {
  id: string
  copyright_notice_id: string
  copyright_notice_submission_id: string
  requester_user_id: string | null
}

export async function createCopyrightFormIntake(
  input: CreateCopyrightFormIntakeInput,
): Promise<{ intake: CopyrightFormIntakeRecord; isDuplicate: boolean }> {
  assertStructuredNoticeStatutoryFields(input.request)
  const requestSha256 = createHash('sha256').update(stableRequestJson(input.request)).digest()
  const requesterIdentitySha256 = createHash('sha256').update(input.requesterIdentity).digest()
  await using transaction = await beginTransaction()
  await transaction(sql`/* createCopyrightFormIntake:identityLock */
    SELECT pg_advisory_xact_lock(hashtextextended(${requesterIdentitySha256.toString('hex')}, 0))
  `)
  const { rows: existingRows } = await transaction<
    CopyrightFormIntakeRecord & { request_sha256: Buffer }
  >(
    sql`/* createCopyrightFormIntake:findDuplicate */
      SELECT id, copyright_notice_id, copyright_notice_submission_id, requester_user_id, request_sha256
      FROM copyright_notice_form_intakes
      WHERE requester_identity_sha256 = ${requesterIdentitySha256} AND idempotency_key = ${input.idempotencyKey}
  `,
  )
  const existing = existingRows[0]
  if (existing) {
    assert(
      existing.request_sha256.equals(requestSha256),
      409,
      'Idempotency-Key was reused for a different request',
    )
    await transaction.commit()
    return { intake: existing, isDuplicate: true }
  }
  const purpose = copyrightFormSecretPurpose(input.idempotencyKey)
  const now = new Date()
  const targets: CopyrightNoticeTargetInput[] = []
  for (const target of input.request.claimantTargets) {
    // oxlint-disable-next-line no-await-in-loop -- use the same filing transaction for the visibility and target snapshot.
    const viewable = await claimantCanViewCopyrightImagePlacement(
      target,
      input.currentUser,
      transaction,
    )
    assert(viewable, 422, 'Hosted image placement was not found')
    // oxlint-disable-next-line no-await-in-loop -- one transaction owns the idempotency lock and authoritative target snapshot.
    targets.push(await resolveCopyrightImagePlacement(target, transaction))
  }
  const notice = await createCopyrightNoticeAggregateInTransaction(
    {
      jurisdiction: input.request.jurisdiction,
      receivedAt: now,
      claimantUserId: input.currentUser?.id ?? null,
      claimantDisplayName: input.request.claimantDisplayName,
      claimantContactCiphertext: encryptSecret(input.request.claimantContact, purpose),
      workDescription: input.request.workDescription,
      policyVersion: 'copyright-form-v1',
      targets,
      initialSubmission: {
        kind: 'notice',
        sourceKind: input.currentUser ? 'signed_in_form' : 'guest_form',
        bodyCiphertext: encryptSecret(
          JSON.stringify({
            good_faith_belief: input.request.goodFaithBelief,
            accuracy_authority_under_penalty_of_perjury:
              input.request.accuracyAuthorityUnderPenaltyOfPerjury,
            electronic_signature: input.request.electronicSignature,
            claimant_targets: input.request.claimantTargets,
          }),
          purpose,
        ),
      },
    },
    transaction,
  )
  const { rows: submissionRows } = await transaction<{
    id: string
  }>(sql`/* createCopyrightFormIntake:submission */
    SELECT id FROM copyright_notice_submissions
    WHERE copyright_notice_id = ${notice.id} AND kind = 'notice'
  `)
  const submission = submissionRows[0]
  assert(submission, 500, 'Copyright notice submission was not created')
  const { rows } = await transaction<CopyrightFormIntakeRecord>(sql`/* createCopyrightFormIntake */
    INSERT INTO copyright_notice_form_intakes (
      copyright_notice_id, copyright_notice_submission_id, requester_user_id,
      requester_identity_sha256, idempotency_key, request_sha256, good_faith_belief,
      accuracy_authority_under_penalty_of_perjury, electronic_signature_ciphertext
    ) VALUES (
      ${notice.id}, ${submission.id}, ${input.currentUser?.id ?? null}, ${requesterIdentitySha256},
      ${input.idempotencyKey}, ${requestSha256}, ${input.request.goodFaithBelief},
      ${input.request.accuracyAuthorityUnderPenaltyOfPerjury},
      ${encryptSecret(input.request.electronicSignature, purpose)}
    )
    RETURNING id, copyright_notice_id, copyright_notice_submission_id, requester_user_id
  `)
  const intake = rows[0]
  assert(intake, 500, 'Copyright form intake was not created')
  await transaction(sql`/* createCopyrightFormIntake:screeningExecution */
    INSERT INTO copyright_notice_form_screening_attempts (
      copyright_notice_form_intake_id, attempt_number, started_at
    ) VALUES (${intake.id}, 1, CURRENT_TIMESTAMP)
  `)
  await createCopyrightFormReceiptInTransaction(
    {
      noticeId: notice.id,
      submissionId: submission.id,
      claimantEmail: input.request.claimantEmail,
    },
    transaction,
  )
  if (input.currentUser) {
    await createCopyrightDeliveryIntent(
      {
        noticeId: notice.id,
        submissionId: submission.id,
        correspondenceId: null,
        recipientUserId: input.currentUser.id,
        recipientRole: 'claimant',
        deliveryKind: 'claimant_receipt',
        channel: 'in_app',
        idempotencyKey: `copyright-notice:${notice.id}:claimant-in-app-receipt`,
      },
      transaction,
    )
  }
  await transaction.commit()
  return { intake, isDuplicate: false }
}

/**
 * A claimant may name only posts they can view right now. Staff approval and email intakes resolve
 * any existing target; this gate runs first so a hidden target answers like a missing one.
 */
export function copyrightFormSecretPurpose(idempotencyKey: string): string {
  return `copyright-form:${idempotencyKey}`
}

export function createCopyrightGuestIdentity(ipAddress: string): string {
  return `guest:${hashToken('copyright-form-guest-identity', ipAddress)}`
}

function stableRequestJson(request: CreateCopyrightFormIntakeInput['request']): string {
  return JSON.stringify({
    ...request,
    claimantTargets: request.claimantTargets.toSorted((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  })
}
