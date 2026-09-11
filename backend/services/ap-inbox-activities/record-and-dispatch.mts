import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { recordInboxActivity } from './record-activity.mts'
import {
  dispatchInboundActivity,
  dispatchInboundPostCommitAction,
  recoverDuplicateFollow,
} from './dispatch-activity.mts'
import type { RemoteActorRow } from '@services/remote-actors'
import type { InboundActivity } from './parse-activity.mts'
import { activityPubInboxDeliveryTransitions } from './durable-delivery-transitions.mts'

export type InboxActivityResult =
  | { outcome: 'applied'; duplicate: boolean }
  | { outcome: 'stale'; duplicate: false }

export type DurableInboxCompletion = {
  deliveryId: string
  processingAttemptId: string
}

class StaleDurableInboxCompletionError extends Error {}

// The unique reservation and the activity's core database effect commit in one PostgreSQL
// transaction. Queue/network work is represented as a post-commit action, so external latency can
// neither hold database locks nor leave a committed marker for a rolled-back effect.
export async function recordAndDispatchInboundActivity(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  completion?: DurableInboxCompletion,
): Promise<InboxActivityResult> {
  let result
  try {
    await using query = await beginTransaction()
    const firstSeen = await recordInboxActivity(activity.id, activity.type, activity.actor, {
      query,
    })
    if (!firstSeen) {
      const postCommitAction =
        activity.type === 'Follow'
          ? await recoverDuplicateFollow(remoteActor, activity, { query })
          : undefined
      await completeDurableDeliveryOrThrow(completion, query)
      result = { duplicate: true as const, postCommitAction }
    } else {
      const postCommitAction = await dispatchInboundActivity(remoteActor, activity, { query })
      await completeDurableDeliveryOrThrow(completion, query)
      result = { duplicate: false as const, postCommitAction }
    }
    await query.commit()
  } catch (error) {
    if (error instanceof StaleDurableInboxCompletionError) {
      return { outcome: 'stale', duplicate: false }
    }
    throw error
  }
  if (result.duplicate) {
    if (result.postCommitAction) dispatchInboundPostCommitAction(result.postCommitAction)
    return { outcome: 'applied', duplicate: true }
  }

  if (result.postCommitAction) dispatchInboundPostCommitAction(result.postCommitAction)
  return { outcome: 'applied', duplicate: false }
}

async function completeDurableDeliveryOrThrow(
  completion: DurableInboxCompletion | undefined,
  query: QueryExecutor,
): Promise<void> {
  if (!completion) return
  const completed = await activityPubInboxDeliveryTransitions.complete(
    completion.deliveryId,
    completion.processingAttemptId,
    { query },
  )
  if (completed.outcome === 'stale') throw new StaleDurableInboxCompletionError()
}
