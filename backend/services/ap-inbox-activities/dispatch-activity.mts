import {
  getEntityRelationMetadataOrThrow,
  softDeleteEntityRelation,
  upsertEntityRelation,
} from '@services/entity-relations'
import { recordLike, undoLike } from '@services/ap-post-likes'
import { enqueueDeliverAcceptActivity } from '@queues/activitypub-delivery/enqueues'
import type { RemoteActorRow } from '@services/remote-actors'
import type { InboundActivity } from './parse-activity.mts'
import type { QueryOptions } from '@data-stores/psql'
import {
  getEmbeddedActivity,
  resolveFederatedTargetUserId,
  resolveLikeTargetPostId,
} from './dispatch-targets.mts'

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
// ap_posts/ap_post_likes ledger (@services/ap-post-likes) — deliberately never post_votes, so a
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
  if (activity.type === 'Follow') {
    return await handleFollow(remoteActor, activity, options)
  }
  if (activity.type === 'Like') {
    await handleLike(remoteActor, activity, options)
    return
  }
  if (activity.type !== 'Undo') return

  const embeddedFollow = getEmbeddedActivity(activity.object, 'Follow')
  if (embeddedFollow) {
    await handleUndoFollow(remoteActor, embeddedFollow.object, options)
    return
  }
  const embeddedLike = getEmbeddedActivity(activity.object, 'Like')
  if (embeddedLike) {
    await handleUndoLike(remoteActor, embeddedLike.object, options)
  }
  return undefined
}

async function handleFollow(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  options: QueryOptions,
): Promise<InboundPostCommitAction | undefined> {
  const targetUserId = await resolveFederatedTargetUserId(activity.object, options)
  if (!targetUserId) return
  await upsertEntityRelation(
    null,
    getEntityRelationMetadataOrThrow(FOLLOW_RELATION),
    { id: remoteActor.id },
    [{ id: targetUserId }],
    { origin: 'remote', ...options },
  )
  return { type: 'send-follow-accept', remoteActor, activity, targetUserId }
}

// Recovers the relation and post-commit Accept action for a duplicate delivery of a
// previously-processed Follow. The guarded relation write shares the dedup/envelope transaction;
// only the queue enqueue remains post-commit.
// Replays the same relation write handleFollow performs (round-3 re-review follow-up): the first delivery may have recorded the dedup row but no-oped the relation write entirely, e.g. because the target hadn't opted into federation yet. A retry after opt-in must not resend an Accept over a relation that was never created, or the remote server ends up believing the follow succeeded while Voucha has no relation to back it. upsertEntityRelation is an idempotent upsert gated on `newly_active` for its outbound side effects, so replaying it for an already-active relation is a harmless no-op. Re-resolves the target (and its current opt-in) rather than trusting stale state, mirroring every other re-check-at-use-time gate in this feature.
// Round-9 re-review fix: the round-7 fix above only read deletion state before writing, and a
// separate read can't close the race — a concurrent Undo(Follow) can commit between the read and
// this write and get silently overwritten by the unconditional ON CONFLICT DO UPDATE. skipIfDeleted
// makes the write itself atomic: Postgres locks the conflicting row and re-checks deleted_at as
// part of the same statement, so a row soft-deleted by a concurrent Undo is left alone (zero rows
// returned) no matter how the two writes interleave. Zero rows means an Undo won the race — skip
// the Accept rather than sending one for a relation this call did not actually resurrect. 'absent'
// (never created, e.g. the round-3 case above) still inserts normally: the guard only suppresses
// the DO UPDATE branch, not the initial INSERT attempt.
export async function recoverDuplicateFollow(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  options: QueryOptions,
): Promise<InboundPostCommitAction | undefined> {
  const targetUserId = await resolveFederatedTargetUserId(activity.object, options)
  if (!targetUserId) return
  const relations = await upsertEntityRelation(
    null,
    getEntityRelationMetadataOrThrow(FOLLOW_RELATION),
    { id: remoteActor.id },
    [{ id: targetUserId }],
    { origin: 'remote', skipIfDeleted: true, ...options },
  )
  if (relations.length === 0) return
  return { type: 'send-follow-accept', remoteActor, activity, targetUserId }
}

// Acknowledges an inbound Follow (Phase C-followup): most implementations (Mastodon included) leave
// a follow relationship "pending" until they receive an Accept referencing this Follow's own id, so
// omitting this leaves every inbound follow permanently unconfirmed on the sender's side. Called
// unconditionally on every successfully-dispatched Follow, and again on every duplicate delivery of
// one — including a resend of an already-active relation's Follow id — because the Accept
// acknowledges the *inbound activity*, not a local state transition. remoteActor.inbox_url/actor_uri
// (not the raw activity.actor string) are used since get-or-fetch.mts already validated them against
// the fetched actor document. Fire-and-forget: enqueue failures are reported internally by the
// glide-mq enqueue wrapper (see reportRejectedEnqueue), and must not fail the inbound request or
// cause recordAndDispatchInboundActivity to roll back and re-process the Follow.
function sendFollowAccept(
  remoteActor: RemoteActorRow,
  activity: InboundActivity,
  targetUserId: string,
): void {
  void enqueueDeliverAcceptActivity({
    sourceUserId: targetUserId,
    inboxUrl: remoteActor.inbox_url,
    followActivityId: activity.id,
    followActorUri: remoteActor.actor_uri,
  })
}

export function dispatchInboundPostCommitAction(action: InboundPostCommitAction): void {
  sendFollowAccept(action.remoteActor, action.activity, action.targetUserId)
}

async function handleUndoFollow(
  remoteActor: RemoteActorRow,
  followObject: unknown,
  options: QueryOptions,
): Promise<void> {
  const targetUserId = await resolveFederatedTargetUserId(followObject, options)
  if (!targetUserId) return
  await softDeleteEntityRelation(
    null,
    getEntityRelationMetadataOrThrow(FOLLOW_RELATION),
    { id: remoteActor.id },
    [{ id: targetUserId }],
    { origin: 'remote', ...options },
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
  likeObject: unknown,
  options: QueryOptions,
): Promise<void> {
  const postId = await resolveLikeTargetPostId(likeObject, options)
  if (!postId) return
  await undoLike(postId, remoteActor.id, options)
}
