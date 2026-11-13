import { commitCopyrightWritersInOrder } from './copyright-form-review-assessment-race.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { admitCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-admission.mts'
import { failCopyrightActionIntent } from '../services/copyright-notices/action-delivery-completion.mts'
import { replayFailedCopyrightDeliveryIntent } from '../services/copyright-notices/delivery-intent-recovery.mts'
import { associateCopyrightEmailIntakeWithNotice } from '../services/copyright-notices/email-manual-association.mts'
import { appendCopyrightSubmissionAssessment } from '../services/copyright-notices/compliance.mts'

type Admission = Parameters<typeof admitCopyrightEmailCorrespondence>[0]

export async function rejectCopyrightAdmissionWithoutSource(
  noticeId: string,
  source: 'correspondence' | 'submission' | 'assessment',
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* rejectCopyrightAdmissionWithoutSource */
    INSERT INTO copyright_notice_lifecycle_changes (
      copyright_notice_id, change_type, copyright_notice_correspondence_id,
      copyright_notice_submission_id, copyright_notice_submission_assessment_identity_id
    ) VALUES (
      ${noticeId}, ${source === 'assessment' ? 'submission_assessed' : source === 'correspondence' ? 'email_correspondence_admitted' : 'supplement_received'},
      ${source === 'correspondence' ? uuidv7() : null},
      ${source === 'submission' ? uuidv7() : null},
      ${source === 'assessment' ? uuidv7() : null}
    )
  `)
  await transaction.commit()
}

export async function assessAndAssociateCopyrightEmail(
  input: Parameters<typeof appendCopyrightSubmissionAssessment>[0],
  noticeId: string,
  intakeId: string,
) {
  const currentUser = input.currentUser
  if (currentUser === null) throw new Error('Owned assessment overlap requires a reviewer')
  const [assessment, association] = await commitCopyrightWritersInOrder(
    () => appendCopyrightSubmissionAssessment(input),
    () => associateCopyrightEmailIntakeWithNotice(currentUser, intakeId, noticeId),
    'appendCopyrightSubmissionAssessment:event',
    'associateCopyrightEmailIntakeWithNotice:link',
    intakeId,
    [noticeId, input.submissionId, intakeId],
  )
  return { assessment, association }
}

/** Resume the first real writer only after the other public actor reaches its native transaction wait. */
export async function admitAndAssociateCopyrightEmail(
  input: Admission,
  noticeId: string,
  associateIntakeId: string,
  first: 'admission' | 'association',
) {
  const admissionMarker =
    input.kind === 'court_or_ccb_hold'
      ? 'preemptCopyrightRestorations'
      : 'admitCopyrightEmailCorrespondence:submission'
  const admit = () => admitCopyrightEmailCorrespondence(input)
  const associate = () =>
    associateCopyrightEmailIntakeWithNotice(input.currentUser, associateIntakeId, noticeId)
  const [winner, loser] = await commitCopyrightWritersInOrder(
    first === 'admission' ? admit : associate,
    first === 'admission' ? associate : admit,
    first === 'admission' ? admissionMarker : 'associateCopyrightEmailIntakeWithNotice:link',
    first === 'admission'
      ? 'associateCopyrightEmailIntakeWithNotice:link'
      : 'admitCopyrightEmailCorrespondence:event',
    first === 'admission' ? associateIntakeId : input.intakeId,
    [noticeId, input.intakeId, associateIntakeId],
  )
  return first === 'admission'
    ? { admission: winner, association: loser }
    : { admission: loser, association: winner }
}

export async function failRestorationAndAdmitCopyrightEmail(
  input: Admission,
  noticeId: string,
  failure: Parameters<typeof failCopyrightActionIntent>[0],
) {
  const [outcome, admission] = await commitCopyrightWritersInOrder(
    () => failCopyrightActionIntent(failure),
    () => admitCopyrightEmailCorrespondence(input),
    'failCopyrightActionIntent',
    'preemptCopyrightRestorations',
    input.intakeId,
    [noticeId, input.intakeId, failure.intentId],
  )
  return { outcome, admission }
}

export async function replayDeliveryAndAssociateCopyrightEmail(
  currentUser: Admission['currentUser'],
  noticeId: string,
  intentId: string,
  intakeId: string,
) {
  const [replayed, association] = await commitCopyrightWritersInOrder(
    () => replayFailedCopyrightDeliveryIntent({ intentId, noticeId, actorUserId: currentUser.id }),
    () => associateCopyrightEmailIntakeWithNotice(currentUser, intakeId, noticeId),
    'replayFailedCopyrightDeliveryIntent',
    'associateCopyrightEmailIntakeWithNotice:link',
    intakeId,
    [noticeId, intentId, intakeId],
  )
  return { replayed, association }
}
