import { CopyrightReplayAdmission } from './replay-admission.mts'
import { preflightCopyrightReplay } from './admission-replay-preflight.mts'
import { findCopyrightReplayIdentity } from './replay-identity-store.mts'
import { recordCopyrightReplayIdentity } from './replay-identity-create.mts'
import { v7 as uuidv7 } from 'uuid'
import { prepareCopyrightEncryptionKey } from './encryption-keys.mts'
import { createHash } from 'node:crypto'
import { createCopyrightReplayDigest } from './replay-identity-hmac.mts'
import { beginTransaction } from '@data-stores/psql'
import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import { createCopyrightNoticeAggregateInTransaction } from './create.mts'
import { createCopyrightFormReceiptInTransaction } from './form-intake-receipt.mts'
import {
  decodeFormReceiptSnapshot,
  type CopyrightFormIntakeRecord,
} from './form-retained-receipt.mts'
import type { CopyrightJurisdiction, CopyrightNoticeTargetInput } from './types.mts'
import {
  resolveCopyrightImagePlacements,
  type CopyrightImageSelector,
} from './placement-resolution.mts'
import { claimantCanViewCopyrightImagePlacements } from './placement-visibility-batch.mts'
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

export async function createCopyrightFormIntake(
  input: CreateCopyrightFormIntakeInput,
  options: { now?: Date } = {},
): Promise<{ intake: CopyrightFormIntakeRecord; isDuplicate: boolean }> {
  assertStructuredNoticeStatutoryFields(input.request)
  const requestSha256 = createHash('sha256').update(stableRequestJson(input.request)).digest()
  const requesterIdentitySha256 = createCopyrightReplayDigest(
    'requester',
    input.requesterIdentity,
  ).digest
  const replayInput = {
    family: 'form_notice' as const,
    jurisdiction: 'us_dmca' as const,
    identity: JSON.stringify([input.requesterIdentity, input.idempotencyKey]),
    requester: input.requesterIdentity,
    request: stableRequestJson(input.request),
  }
  const preflight = await preflightCopyrightReplay(replayInput)
  if (preflight) {
    assert(preflight.liveSnapshot, 404, 'Copyright notice not found')
    return { intake: decodeFormReceiptSnapshot(preflight.liveSnapshot), isDuplicate: true }
  }
  const noticeId = uuidv7()
  await using encryptionKey = await prepareCopyrightEncryptionKey('notice')
  await using transaction = await beginTransaction()
  const replayAdmission = await CopyrightReplayAdmission.open(transaction, replayInput)
  const existing = await findCopyrightReplayIdentity(replayAdmission)
  if (existing) {
    const replay = await existing.replay()
    await transaction.commit()
    assert(replay.liveSnapshot, 404, 'Copyright notice not found')
    return { intake: decodeFormReceiptSnapshot(replay.liveSnapshot), isDuplicate: true }
  }
  const purpose = copyrightFormSecretPurpose(input.idempotencyKey)
  const now = options.now ?? new Date()
  if (!Number.isFinite(now.getTime())) throw new TypeError('Copyright form clock must be valid')
  const viewability = await claimantCanViewCopyrightImagePlacements(
    input.request.claimantTargets,
    input.currentUser,
    transaction,
  )
  for (const viewable of viewability) {
    assert(viewable, 422, 'Hosted image placement was not found')
  }
  const targets: CopyrightNoticeTargetInput[] = await resolveCopyrightImagePlacements(
    input.request.claimantTargets,
    transaction,
  )
  const notice = await createCopyrightNoticeAggregateInTransaction(
    {
      jurisdiction: input.request.jurisdiction,
      receivedAt: now,
      claimantUserId: input.currentUser?.id ?? null,
      claimantDisplayName: input.request.claimantDisplayName,
      claimantContact: input.request.claimantContact,
      secretPurpose: purpose,
      workDescription: input.request.workDescription,
      policyVersion: 'copyright-form-v1',
      targets,
      initialSubmission: {
        kind: 'notice',
        sourceKind: input.currentUser ? 'signed_in_form' : 'guest_form',
        body: JSON.stringify({
          has_good_faith_belief: input.request.goodFaithBelief,
          has_accuracy_authority_under_penalty_of_perjury:
            input.request.accuracyAuthorityUnderPenaltyOfPerjury,
          electronic_signature: input.request.electronicSignature,
          claimant_targets: input.request.claimantTargets,
        }),
      },
    },
    transaction,
    { noticeId, key: encryptionKey },
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
      requester_identity_hmac, idempotency_key, request_sha256, has_good_faith_belief,
      has_accuracy_authority_under_penalty_of_perjury, electronic_signature_ciphertext
    ) VALUES (
      ${notice.id}, ${submission.id}, ${input.currentUser?.id ?? null}, ${requesterIdentitySha256},
      ${input.idempotencyKey}, ${requestSha256}, ${input.request.goodFaithBelief},
      ${input.request.accuracyAuthorityUnderPenaltyOfPerjury},
      ${encryptionKey.encrypt(input.request.electronicSignature, purpose, { kind: 'notice', id: notice.id })}
    )
    RETURNING id, copyright_notice_id, copyright_notice_submission_id
  `)
  const intake = rows[0]
  assert(intake, 500, 'Copyright form intake was not created')
  // ast-grep-ignore: no-three-sequential-awaits -- screening admission precedes its claimant receipt, and both must succeed before the immutable exact-replay identity is stored in this transaction.
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
      claimantUserId: input.currentUser?.id ?? null,
    },
    transaction,
  )
  await recordCopyrightReplayIdentity(replayAdmission, notice.id, 'notice_received', {
    ...intake,
  })
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
  // Server-only canonical input: persistence uses the separately versioned replay HMAC ring.
  // Never persist or log this transient identity; unrelated OTP rotation must not alter replay.
  return `guest:${ipAddress}`
}

function stableRequestJson(request: CreateCopyrightFormIntakeInput['request']): string {
  return JSON.stringify({
    ...request,
    claimantTargets: request.claimantTargets.toSorted((a, b) =>
      JSON.stringify(a).localeCompare(JSON.stringify(b)),
    ),
  })
}
