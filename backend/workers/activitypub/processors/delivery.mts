import { getActorKeyId } from '@modules/activitypub-uris'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { wrapHttpForRetry } from '@modules/queue-errors'
import { getMaximumActivityAgeDays } from '@services/ap-inbox-activities/config'
import {
  buildActivityJson,
  commitActivityDistributionPage,
  deliverActivityToInbox,
  prepareActivityDistributionPage,
  releaseActivityDistributionPage,
} from '@services/activitypub-delivery'
import { getActorPrivateKeyPem } from '@services/ap-actor-keys'
import { isFederationEnabledForUser } from '@services/users'
import {
  enqueueBulkDeliverActivity,
  type DeliverActivityData,
  type DistributeActivityData,
} from '@queues/activitypub/enqueues/delivery'

type DistributeActivityDependencies = {
  enqueueBulkDeliverActivity: typeof enqueueBulkDeliverActivity
  isFederationEnabledForUser: typeof isFederationEnabledForUser
  prepareActivityDistributionPage: typeof prepareActivityDistributionPage
  commitActivityDistributionPage: typeof commitActivityDistributionPage
  releaseActivityDistributionPage: typeof releaseActivityDistributionPage
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

function activityAgeRejectionReason(
  activityId: string,
): 'unsupported-activity-id' | 'expired-activity' | null {
  const activityCreatedAt = getDateFromUUIDv7(activityId)
  if (!activityCreatedAt) return 'unsupported-activity-id'
  return Date.now() - activityCreatedAt.getTime() > getMaximumActivityAgeDays() * 86_400_000
    ? 'expired-activity'
    : null
}

// Fans a social action out to a bounded page of the acting user's remote followers. The durable
// cursor advances only after Valkey accepts that page's delivery jobs; continuation enqueues one
// more ordered distribute job. An accepted Valkey enqueue followed by a failed cursor commit may
// replay that page, so external delivery remains at-least-once.
export async function distributeActivity(
  data: DistributeActivityData,
  dependencies?: Partial<DistributeActivityDependencies>,
  pageSize?: number,
) {
  const deps = {
    enqueueBulkDeliverActivity,
    isFederationEnabledForUser,
    prepareActivityDistributionPage,
    commitActivityDistributionPage,
    releaseActivityDistributionPage,
    ...dependencies,
  }

  if (isUndoMissingOriginalActivityId(data)) {
    return { enqueued: 0, reason: 'missing-original-activity-id' as const }
  }
  // UUIDv7 age prevents delayed retries from recreating an expired checkpoint.
  const ageRejection = activityAgeRejectionReason(data.activityId)
  if (ageRejection) return { enqueued: 0, reason: ageRejection }
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

  const page = await deps.prepareActivityDistributionPage(
    data.activityId,
    data.sourceUserId,
    {},
    pageSize,
  )
  if (page.status === 'expired') return { enqueued: 0, reason: 'expired-activity' as const }
  if (page.status === 'completed') return { enqueued: 0, completed: true }
  if (page.status === 'busy') {
    return { enqueued: 0, busy: true, retryAfterMs: page.retryAfterMs }
  }

  try {
    if (page.inboxUrls.length > 0) {
      await deps.enqueueBulkDeliverActivity(page.inboxUrls.map(inboxUrl => ({ ...data, inboxUrl })))
    }
  } catch (err) {
    await deps.releaseActivityDistributionPage(data.activityId, page.leaseToken)
    throw err
  }

  const completed = !page.hasMore
  const committed = await deps.commitActivityDistributionPage(
    data.activityId,
    data.sourceUserId,
    page.expectedRemoteActorId,
    page.nextRemoteActorId,
    completed,
    page.leaseToken,
  )
  if (!committed) {
    return { enqueued: page.inboxUrls.length, completed: false, stale: true }
  }
  return {
    enqueued: page.inboxUrls.length,
    completed,
    ...(!completed ? { cursor: page.nextRemoteActorId ?? undefined } : {}),
  }
}

// Recheck the sender's opt-in and keypair before HTTP: disabling federation leaves keys intact,
// while a missing key cannot recover through retries.
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
  // Accept is a direct response with a stable UUIDv5 wire identity, not a distribution job.
  // Every other production delivery shares the UUIDv7 source event and its maximum age.
  // prepareActivityDistributionPage already checked the floor while claiming this page.
  // Admitted deliveries may drain after it advances; never take a floor lock per recipient.
  if (data.activityType !== 'Accept') {
    const ageRejection = activityAgeRejectionReason(data.activityId)
    if (ageRejection) return { delivered: false, reason: ageRejection }
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
