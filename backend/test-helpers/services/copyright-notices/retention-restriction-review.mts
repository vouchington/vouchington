import { randomUUID } from 'node:crypto'
import { completeCopyrightMandatoryHumanReview } from '../../../services/copyright-notices/index.mts'
import {
  getCopyrightRepeatInfringerAccount,
  recordCopyrightRepeatInfringerDisposition,
} from '../../../services/copyright-notices/repeat-infringer-incidents.mts'
import type { PrivateUser } from '../../../services/users/types.mts'
import { getCopyrightNoticePrivateAggregate } from './private-aggregate.mts'

/**
 * A moderator confirms the case's provisional restriction, which leaves an encrypted review
 * rationale on a lifecycle event and raises a repeat-infringer incident, and then dispositions the
 * incident as a duplicate so nothing stays open. Needs a restriction still awaiting its mandatory
 * human review.
 */
export async function reviewRetentionRestriction(input: {
  noticeId: string
  posterId: string
  moderator: PrivateUser
}): Promise<void> {
  const restriction = (await getCopyrightNoticePrivateAggregate(input.noticeId))?.restrictions[0]
  if (!restriction) throw new Error('fixture restriction missing')
  await completeCopyrightMandatoryHumanReview({
    currentUser: input.moderator,
    noticeId: input.noticeId,
    restrictionId: restriction.id,
    action: 'confirm',
    rationale: `The restriction stands after review ${randomUUID()}.`,
    reviewedAt: new Date(),
  })
  const incident = (await getCopyrightRepeatInfringerAccount(input.posterId)).incidents.find(
    entry => entry.copyright_notice_id === input.noticeId,
  )
  if (!incident) throw new Error('fixture repeat-infringer incident missing')
  await recordCopyrightRepeatInfringerDisposition({
    currentUser: input.moderator,
    incidentId: incident.id,
    disposition: 'duplicate',
    rationale: `The notice duplicates an earlier case ${randomUUID()}.`,
    recordedAt: new Date(),
  })
}
