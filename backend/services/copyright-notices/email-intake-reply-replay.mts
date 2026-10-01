import type { PrivateUser } from '@services/users/types'
import assert from 'http-assert'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import { replayFailedCopyrightEmailIntakeReplyIntent } from './delivery-intents.mts'

/**
 * Lets a reviewer put the failed reply to a declined email intake back in the delivery queue, with
 * the same authorization and one-shot reset as the case replay. Returns the reply's intent id when
 * this call reset it, so the caller enqueues the email once, and null when the intake has no failed
 * reply. A bounced reply is terminal and never matches. The audit row names the actor and belongs
 * to the reply because the declined intake has no case.
 */
export async function replayFailedCopyrightEmailIntakeReply(input: {
  currentUser: PrivateUser
  intakeId: string
}): Promise<string | null> {
  assert(currentUserCanReviewCopyrightNotices(input.currentUser), 403, 'Forbidden')
  return replayFailedCopyrightEmailIntakeReplyIntent({
    intakeId: input.intakeId,
    actorUserId: input.currentUser.id,
  })
}
