import {
  enqueueContinueContentVisibility,
  enqueueContinueMembershipVisibility,
} from '@queues/notifications/enqueues'

type EntityChange =
  | { postId: string; rssFeedItemId?: never; changeId: string }
  | { postId?: never; rssFeedItemId: string; changeId: string }
type VisibilityResult = { nextVisibilityCursor?: Cursor; nextMembershipCursor?: Cursor }

type Cursor = { userId: string; notificationId: string }
const pageOf = (d: EntityChange, after: Cursor) =>
  d.postId !== undefined
    ? { postId: d.postId, changeId: d.changeId, after }
    : { rssFeedItemId: d.rssFeedItemId, changeId: d.changeId, after }

export async function enqueueVisibilityContinuations(data: EntityChange, result: VisibilityResult) {
  if (result.nextVisibilityCursor)
    await enqueueContinueContentVisibility(pageOf(data, result.nextVisibilityCursor))
  if (result.nextMembershipCursor)
    await enqueueContinueMembershipVisibility(pageOf(data, result.nextMembershipCursor))
}
