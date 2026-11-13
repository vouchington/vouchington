import { commitCopyrightWritersInOrder } from './copyright-form-review-assessment-race.mts'
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
  const [winner, loser] = await commitCopyrightWritersInOrder(
    first === 'rejection' ? reject : associate,
    first === 'rejection' ? associate : reject,
    first === 'rejection'
      ? 'rejectCopyrightEmailCorrespondence'
      : 'associateCopyrightEmailIntakeWithNotice:link',
    first === 'rejection'
      ? 'associateCopyrightEmailIntakeWithNotice:link'
      : 'rejectCopyrightEmailCorrespondence:event',
    first === 'rejection' ? associateIntakeId : input.intakeId,
    [noticeId, input.intakeId, associateIntakeId],
  )
  return first === 'rejection'
    ? { rejection: winner, association: loser }
    : { rejection: loser, association: winner }
}
