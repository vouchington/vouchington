import { getActorKeyId } from '@modules/activitypub-uris'
import { wrapHttpForRetry } from '@modules/queue-errors'
import {
  buildActivityJson,
  canDistributeOutboundActivity,
  deliverActivityToInbox,
  getOutboundActivityDeliveryCredentials,
  prepareActivityDistributionPage,
  type OutboundActivityDeliveryDependencies,
  type OutboundActivityEligibilityDependencies,
} from '@services/activitypub-delivery'
import {
  enqueueBulkDeliverActivity,
  type DeliverActivityData,
  type DistributeActivityData,
} from '@queues/activitypub/enqueues/delivery'

type DistributeActivityDependencies = OutboundActivityEligibilityDependencies & {
  enqueueBulkDeliverActivity: typeof enqueueBulkDeliverActivity
  prepareActivityDistributionPage: typeof prepareActivityDistributionPage
}

type DeliverActivityDependencies = OutboundActivityDeliveryDependencies & {
  buildActivityJson: typeof buildActivityJson
  deliverActivityToInbox: typeof deliverActivityToInbox
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
    prepareActivityDistributionPage,
    ...dependencies,
  }

  if (isUndoMissingOriginalActivityId(data)) {
    return { enqueued: 0, completed: true, reason: 'missing-original-activity-id' as const }
  }
  if (!(await canDistributeOutboundActivity(data, deps))) return { enqueued: 0, completed: true }

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
    ...dependencies,
  }

  if (isUndoMissingOriginalActivityId(data)) {
    return { delivered: false, reason: 'missing-original-activity-id' as const }
  }
  const eligibility = await getOutboundActivityDeliveryCredentials(data, deps)
  if ('reason' in eligibility) return { delivered: false, reason: eligibility.reason }

  const activity = deps.buildActivityJson(data)
  await deps
    .deliverActivityToInbox({
      inboxUrl: data.inboxUrl,
      activity,
      keyId: getActorKeyId(data.sourceUserId),
      privateKeyPem: eligibility.privateKeyPem,
    })
    .catch(wrapHttpForRetry)

  return { delivered: true }
}
