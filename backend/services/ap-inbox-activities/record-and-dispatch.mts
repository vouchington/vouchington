import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { recordInboxActivity } from './record-activity.mts'
import {
  dispatchInboundActivity,
  dispatchInboundPostCommitAction,
  recoverDuplicateFollow,
} from './dispatch-activity.mts'
import type { RemoteActorRow } from '@services/remote-actors'
import type { InboundActivity } from './parse-activity.mts'
import { getMaximumActivityAgeDays } from './config.mts'
import { lockActivityPubReplayFloor } from './replay-floor.mts'
import createHttpError from 'http-errors'

export type InboxActivityResult = {
  duplicate: boolean
  postCommitEnqueue?: ReturnType<typeof dispatchInboundPostCommitAction>
}

// The unique reservation and the activity's core database effect commit in one PostgreSQL
// transaction. Queue/network work is represented as a post-commit action, so external latency can
// neither hold database locks nor leave a committed marker for a rolled-back effect.
export async function recordAndDispatchInboundActivity(
  remoteActor: RemoteActorRow,
  activity: InboundActivity & { signedAt: Date },
): Promise<InboxActivityResult> {
  // This check precedes the inbox identity lookup, including after its retention row expires.
  const ageMs = Date.now() - activity.signedAt.getTime()
  if (!Number.isFinite(ageMs) || ageMs > getMaximumActivityAgeDays() * 24 * 60 * 60 * 1_000) {
    throw createHttpError(401, 'Activity signature date is too old')
  }
  await using query = await beginTransaction()
  const result = await recordAndDispatchInboundActivityInTransaction(query, remoteActor, activity)
  await query.commit()
  return {
    duplicate: result.duplicate,
    ...(result.postCommitAction
      ? { postCommitEnqueue: dispatchInboundPostCommitAction(result.postCommitAction) }
      : {}),
  }
}

export async function recordAndDispatchInboundActivityInTransaction(
  query: TransactionQuery,
  remoteActor: RemoteActorRow,
  activity: InboundActivity & { signedAt: Date },
) {
  const rejectionFloor = await lockActivityPubReplayFloor(query)
  if (rejectionFloor && activity.signedAt <= rejectionFloor) {
    throw createHttpError(401, 'Activity signature date is retired')
  }
  const firstSeen = await recordInboxActivity(activity.id, activity.type, activity.actor, {
    query,
  })
  if (!firstSeen) {
    const postCommitAction =
      activity.type === 'Follow'
        ? await recoverDuplicateFollow(remoteActor, activity, { query })
        : undefined
    return { duplicate: true as const, postCommitAction }
  }
  const postCommitAction = await dispatchInboundActivity(remoteActor, activity, { query })
  return { duplicate: false as const, postCommitAction }
}
