import {
  getEntityRelationMetadataOrThrow,
  softDeleteEntityRelation,
  upsertEntityRelation,
} from '@services/entity-relations'
import { recordLike, undoLike } from '@services/ap-post-likes'
import { enqueueDeliverAcceptActivity } from '@queues/activitypub/enqueues/delivery'
import type { RemoteActorRow } from '@services/remote-actors'
import type { InboundActivity } from './parse-activity.mts'
import { beginTransaction, type QueryOptions } from '@data-stores/psql'
import {
  getEmbeddedActivity,
  resolveFederatedTargetUserId,
  resolveLikeTargetPostId,
  resolveUndoLikeTargetPostId,
  resolveUndoTargetUserId,
} from './dispatch-targets.mts'
import {
  isCurrentRemoteFollowCycle,
  markRemoteFollowUndone,
  reserveRemoteFollowCycle,
  setCurrentRemoteFollowCycle,
} from './follow-cycles.mts'

export type InboundPostCommitAction = {
  type: 'send-follow-accept'
  remoteActor: RemoteActorRow
  activity: InboundActivity
  targetUserId: string
}

const FOLLOW_RELATION = {
  subjectType: 'remote_actor',
  objectType: 'user',
  predicate: 'follow',
} as const

// Maps inbound Follow/Undo(Follow) and Like/Undo(Like) activities onto their respective
// write-paths (Phase C2). Follow/Undo(Follow) go through the existing
// remote_actor -> user -> follow entity relation; Like/Undo(Like) go through the isolated
// post_activitypub_like_tallies/activitypub_post_likes ledger (@services/ap-post-likes) — deliberately never post_votes, so a
// remote actor can never move local ranking (see the reuse-mapping table in
// docs/overview/architecture/fediverse-federation.md). Both write-paths use `origin: 'remote'`
// (Follow) or an isolated table with no outbound-emission concept of its own (Like), which
// together satisfy Phase C3's loop-prevention gate. Every other activity type (Create, Announce,
// ...) is an intentional silent no-op — recordInboxActivity has already durably logged the
// activity before dispatch runs, so an unrecognized type must not fail the request.
export async function dispatchInboundActivity(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  options: QueryOptions = {},
): Promise<InboundPostCommitAction | undefined> {
  if (!options.query) {
    await using query = await beginTransaction()
    const action = await dispatchInboundActivity(remoteActor, activity, { query })
    await query.commit()
    return action
  }
  if (activity.type === 'Follow') {
    return recoverDuplicateFollow(remoteActor, activity, options)
  }
  if (activity.type === 'Like') {
    await handleLike(remoteActor, activity, options)
    return
  }
  if (activity.type !== 'Undo') return

  const embeddedFollow = getEmbeddedActivity(activity.object, 'Follow')
  if (embeddedFollow) {
    await handleUndoFollow(remoteActor, embeddedFollow.id, embeddedFollow.object, options)
    return
  }
  const embeddedLike = getEmbeddedActivity(activity.object, 'Like')
  if (embeddedLike) {
    await handleUndoLike(remoteActor, embeddedLike.id, embeddedLike.object, options)
  }
  return undefined
}

// A duplicate may become applicable after target opt-in. The per-activity cycle preserves
// earlier Undo state and fences a concurrent Undo before any relation write or Accept.
export async function recoverDuplicateFollow(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  options: QueryOptions,
): Promise<InboundPostCommitAction | undefined> {
  const targetUserId = await resolveFederatedTargetUserId(activity.object, options)
  if (!targetUserId) return
  const cycle = await reserveRemoteFollowCycle(activity.id, remoteActor.id, targetUserId, options)
  if (cycle.isUndone) return
  if (!cycle.isNew) {
    return (await isCurrentRemoteFollowCycle(remoteActor.id, targetUserId, cycle.id, options))
      ? { type: 'send-follow-accept', remoteActor, activity, targetUserId }
      : undefined
  }
  await upsertEntityRelation(
    null,
    getEntityRelationMetadataOrThrow(FOLLOW_RELATION),
    { id: remoteActor.id },
    [{ id: targetUserId }],
    { origin: 'remote', ...options },
  )
  await setCurrentRemoteFollowCycle(remoteActor.id, targetUserId, cycle.id, options)
  return { type: 'send-follow-accept', remoteActor, activity, targetUserId }
}

// Acknowledges an inbound Follow (Phase C-followup): most implementations (Mastodon included) leave
// a follow relationship "pending" until they receive an Accept referencing this Follow's own id, so
// omitting this leaves every inbound follow permanently unconfirmed on the sender's side. Called
// unconditionally on every successfully-dispatched Follow, and again on every duplicate delivery of
// one — including a resend of an already-active relation's Follow id — because the Accept
// acknowledges the *inbound activity*, not a local state transition. remoteActor.inbox_url/actor_uri
// (not the raw activity.actor string) are used since get-or-fetch.mts already validated them against
// the fetched actor document. The enqueue wrapper reports failures internally (see
// reportRejectedEnqueue); returning its promise makes completion observable without changing the
// route or durable-worker response contracts.
function sendFollowAccept(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  targetUserId: string,
): ReturnType<typeof enqueueDeliverAcceptActivity> {
  return enqueueDeliverAcceptActivity({
    sourceUserId: targetUserId,
    inboxUrl: remoteActor.inbox_url,
    followActivityId: activity.id,
    followActorUri: remoteActor.actor_uri,
  })
}

export function dispatchInboundPostCommitAction(
  action: InboundPostCommitAction,
): ReturnType<typeof enqueueDeliverAcceptActivity> {
  return sendFollowAccept(action.remoteActor, action.activity, action.targetUserId)
}

async function handleUndoFollow(
  remoteActor: RemoteActorRow,
  followActivityId: string,
  followObject: unknown,
  options: QueryOptions,
): Promise<void> {
  const targetUserId = await resolveUndoTargetUserId(followObject, options)
  if (!targetUserId) return
  const cycleId = await markRemoteFollowUndone(followActivityId, remoteActor, targetUserId, options)
  if (!cycleId) return
  await softDeleteEntityRelation(
    null,
    getEntityRelationMetadataOrThrow(FOLLOW_RELATION),
    { id: remoteActor.id },
    [{ id: targetUserId }],
    { origin: 'remote', expectedInboundFollowActivityRowId: cycleId, ...options },
  )
}

async function handleLike(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  options: QueryOptions,
): Promise<void> {
  const postId = await resolveLikeTargetPostId(activity.object, options)
  if (!postId) return
  await recordLike(postId, remoteActor.id, activity.id, options)
}

async function handleUndoLike(
  remoteActor: RemoteActorRow,
  likeActivityId: string,
  likeObject: unknown,
  options: QueryOptions,
): Promise<void> {
  const postId = await resolveUndoLikeTargetPostId(likeObject, options)
  if (!postId) return
  await undoLike(postId, remoteActor, likeActivityId, options)
}
