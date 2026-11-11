import { overlapCopyrightWriters } from './copyright-admission-association-race.mts'
import { rejectCopyrightEmailCorrespondence } from '../services/copyright-notices/email-correspondence-rejection.mts'
import { associateCopyrightEmailIntakeWithNotice } from '../services/copyright-notices/email-manual-association.mts'

export async function rejectAndAssociateCopyrightEmail(
  input: Parameters<typeof rejectCopyrightEmailCorrespondence>[0],
  noticeId: string,
  associateIntakeId: string,
  first: 'rejection' | 'association',
) {
  const reject = () => rejectCopyrightEmailCorrespondence(input)
  const associate = () =>
    associateCopyrightEmailIntakeWithNotice(input.currentUser, associateIntakeId, noticeId)
  const ownedIds = [noticeId, input.intakeId, associateIntakeId]
  if (first === 'rejection') {
    const [rejection, association] = await overlapCopyrightWriters(
      'rejectCopyrightEmailCorrespondence',
      reject,
      associate,
      ownedIds,
    )
    return { rejection, association }
  }
  const [association, rejection] = await overlapCopyrightWriters(
    'associateCopyrightEmailIntakeWithNotice:link',
    associate,
    reject,
    ownedIds,
  )
  return { rejection, association }
}
