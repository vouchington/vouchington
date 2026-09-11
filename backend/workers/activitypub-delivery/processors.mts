import { getActorKeyId } from '@modules/activitypub-uris'
import { wrapHttpForRetry } from '@modules/queue-errors'
import {
  buildActivityJson,
  commitActivityDistributionPage,
  deliverActivityToInbox,
  prepareActivityDistributionPage,
} from '@services/activitypub-delivery'
import { getActorPrivateKeyPem } from '@services/ap-actor-keys'
import { isFederationEnabledForUser } from '@services/users'
import {
  enqueueBulkDeliverActivity,
  enqueueDistributeActivity,
  type DeliverActivityData,
  type DistributeActivityData,
} from '@queues/activitypub-delivery/enqueues'

type DistributeActivityDependencies = {
  enqueueBulkDeliverActivity: typeof enqueueBulkDeliverActivity
  enqueueDistributeActivity: typeof enqueueDistributeActivity
  isFederationEnabledForUser: typeof isFederationEnabledForUser
  prepareActivityDistributionPage: typeof prepareActivityDistributionPage
  commitActivityDistributionPage: typeof commitActivityDistributionPage
}

type DeliverActivityDependencies = {
  buildActivityJson: typeof buildActivityJson
  deliverActivityToInbox: typeof deliverActivityToInbox
  getActorPrivateKeyPem: typeof getActorPrivateKeyPem
  isFederationEnabledForUser: typeof isFederationEnabledForUser
}

function isUndoMissingOriginalActivityId(
  data: DistributeActivityData | DeliverActivityData,
): boolean {
  if (data.activityType !== 'UndoFollow' && data.activityType !== 'UndoLike') return false
  const originalActivityId = (data as { originalActivityId?: unknown }).originalActivityId
  return typeof originalActivityId !== 'string' || originalActivityId.trim().length === 0
}

// Fans a social action out to a bounded page of the acting user's remote followers. The durable
// cursor advances only after Valkey accepts that page's delivery jobs; continuation enqueues one
// more ordered distribute job. An accepted Valkey enqueue followed by a failed cursor commit may
// replay that page, so external delivery remains at-least-once.
export async function distributeActivity(
  data: DistributeActivityData,
  dependencies?: Partial<DistributeActivityDependencies>,
) {
  const deps = {
    enqueueBulkDeliverActivity,
    enqueueDistributeActivity,
    isFederationEnabledForUser,
    prepareActivityDistributionPage,
    commitActivityDistributionPage,
    ...dependencies,
  }

  if (isUndoMissingOriginalActivityId(data)) {
    return { enqueued: 0, reason: 'missing-original-activity-id' as const }
  }
  if (!(await deps.isFederationEnabledForUser(data.sourceUserId))) {
    return { enqueued: 0 }
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
    return { enqueued: 0 }
  }

  const page = await deps.prepareActivityDistributionPage(data.activityId, data.sourceUserId)
  if (page.status === 'completed') return { enqueued: 0, completed: true }

  if (page.inboxUrls.length > 0) {
    await deps.enqueueBulkDeliverActivity(page.inboxUrls.map(inboxUrl => ({ ...data, inboxUrl })))
  }

  const completed = !page.hasMore
  const committed = await deps.commitActivityDistributionPage(
    data.activityId,
    data.sourceUserId,
    page.expectedRemoteActorId,
    page.nextRemoteActorId,
    completed,
  )
  if (!committed) return { enqueued: page.inboxUrls.length, completed: false, stale: true }
  if (page.hasMore) await deps.enqueueDistributeActivity(data)
  return { enqueued: page.inboxUrls.length, completed }
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
