import { getActorKeyId } from '@modules/activitypub-uris'
import { wrapHttpForRetry } from '@modules/queue-errors'
import {
  buildActivityJson,
  deliverActivityToInbox,
  prepareActivityDistributionPage,
} from '@services/activitypub-delivery'
import { getActorPrivateKeyPem } from '@services/ap-actor-keys'
import { isFederationEnabledForUser } from '@services/users'
import { canDistributeActivityPubLike } from '@services/posts/activitypub-visibility'
import {
  enqueueBulkDeliverActivity,
  type DeliverActivityData,
  type DistributeActivityData,
} from '@queues/activitypub/enqueues/delivery'

type DistributeActivityDependencies = {
  enqueueBulkDeliverActivity: typeof enqueueBulkDeliverActivity
  isFederationEnabledForUser: typeof isFederationEnabledForUser
  canDistributeActivityPubLike: typeof canDistributeActivityPubLike
  prepareActivityDistributionPage: typeof prepareActivityDistributionPage
}

type DeliverActivityDependencies = {
  buildActivityJson: typeof buildActivityJson
  deliverActivityToInbox: typeof deliverActivityToInbox
  getActorPrivateKeyPem: typeof getActorPrivateKeyPem
  isFederationEnabledForUser: typeof isFederationEnabledForUser
  canDistributeActivityPubLike: typeof canDistributeActivityPubLike
}

function isUndoMissingOriginalActivityId(
  data: DistributeActivityData | DeliverActivityData,
): boolean {
  if (data.activityType !== 'UndoFollow' && data.activityType !== 'UndoLike') return false
  const originalActivityId = (data as { originalActivityId?: unknown }).originalActivityId
  return typeof originalActivityId !== 'string' || originalActivityId.trim().length === 0
}

// Fans a social action out to a bounded page of the acting user's remote followers. The shared
// paged dispatcher records the page admission before enqueueing the next cursor job.
export async function distributeActivity(
  data: DistributeActivityData,
  dependencies?: Partial<DistributeActivityDependencies>,
  pageSize?: number,
) {
  const deps = {
    enqueueBulkDeliverActivity,
    isFederationEnabledForUser,
    canDistributeActivityPubLike,
    prepareActivityDistributionPage,
    ...dependencies,
  }

  if (isUndoMissingOriginalActivityId(data)) {
    return { enqueued: 0, completed: true, reason: 'missing-original-activity-id' as const }
  }
  if (!(await deps.isFederationEnabledForUser(data.sourceUserId))) {
    return { enqueued: 0, completed: true }
  }
  // Follow/UndoFollow name a local target user in `object` (unlike Like/UndoLike, whose target is
  // a post) — announcing "I followed/unfollowed X" to the source's remote audience discloses X's
  // actor URI and follow edge even though X never opted into federation. Gate on the target's own
  // opt-in, mirroring the existing inbound-Follow and GET /ap/users/:id gates.
  //
  // UndoFollow is gated on the target's opt-in the same as Follow — a deliberate choice, not an
  // oversight. Gating on the target's *current* state (rather than tracking whether the original
  // Follow was ever announced) means a target who opts out between being followed and unfollowed
  // leaves a stale "still following" belief on the remote side (no retraction reaches them). The
  // alternative — always emitting UndoFollow — is worse: a target who was *never* federated (Follow
  // correctly suppressed) would have their identity disclosed for the first time by an UndoFollow
  // with nothing to retract. Consistent gating never discloses a non-consenting target.
  if (
    (data.activityType === 'Follow' || data.activityType === 'UndoFollow') &&
    !(await deps.isFederationEnabledForUser(data.targetUserId))
  ) {
    return { enqueued: 0, completed: true }
  }
  if (
    (data.activityType === 'Like' || data.activityType === 'UndoLike') &&
    !(await deps.canDistributeActivityPubLike(data.targetPostId))
  ) {
    return { enqueued: 0, completed: true }
  }

  const page = await deps.prepareActivityDistributionPage(
    data.sourceUserId,
    data.cursor ?? null,
    pageSize,
  )
  if (page.inboxUrls.length > 0) {
    await deps.enqueueBulkDeliverActivity(page.inboxUrls.map(inboxUrl => ({ ...data, inboxUrl })))
  }
  const completed = !page.hasMore
  return {
    enqueued: page.inboxUrls.length,
    completed,
    ...(!completed ? { cursor: page.nextRemoteActorId ?? undefined } : {}),
  }
}

// Delivers one previously-built activity to one follower inbox (Phase C4). Drops the job (does
// not throw, so it is not retried) when the sending user has no actor keypair — federation was
// toggled on and then off, or the keypair row was never created — since there is nothing to sign
// with and retrying cannot change that. Also re-checks federation-enabled here, not just at
// distributeActivity's fan-out time: toggling the preference off does not delete the actor
// keypair, so a job enqueued before the user disabled federation would otherwise still deliver
// after the toggle, silently violating the opt-in.
export async function deliverActivity(
  data: DeliverActivityData,
  dependencies?: Partial<DeliverActivityDependencies>,
) {
  const deps = {
    buildActivityJson,
    deliverActivityToInbox,
    getActorPrivateKeyPem,
    isFederationEnabledForUser,
    canDistributeActivityPubLike,
    ...dependencies,
  }

  if (isUndoMissingOriginalActivityId(data)) {
    return { delivered: false, reason: 'missing-original-activity-id' as const }
  }
  if (!(await deps.isFederationEnabledForUser(data.sourceUserId))) {
    return { delivered: false, reason: 'federation-disabled' as const }
  }
  // Re-check the target's opt-in here too, not just at distributeActivity's fan-out time — same
  // toggle-race rationale as the source re-check above (the target could disable federation
  // between enqueue and delivery).
  if (
    (data.activityType === 'Follow' || data.activityType === 'UndoFollow') &&
    !(await deps.isFederationEnabledForUser(data.targetUserId))
  ) {
    return { delivered: false, reason: 'federation-disabled' as const }
  }
  if (
    (data.activityType === 'Like' || data.activityType === 'UndoLike') &&
    !(await deps.canDistributeActivityPubLike(data.targetPostId))
  ) {
    return { delivered: false, reason: 'post-not-public' as const }
  }

  const privateKeyPem = await deps.getActorPrivateKeyPem(data.sourceUserId)
  if (!privateKeyPem) {
    return { delivered: false, reason: 'missing-actor-keypair' as const }
  }

  const activity = deps.buildActivityJson(data)
  await deps
    .deliverActivityToInbox({
      inboxUrl: data.inboxUrl,
      activity,
      keyId: getActorKeyId(data.sourceUserId),
      privateKeyPem,
    })
    .catch(wrapHttpForRetry)

  return { delivered: true }
}
