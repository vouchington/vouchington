import { defineBackgroundDomain } from './define-job.mts'

// Reserve independent delivery and cleanup capacity so inbound traffic cannot occupy outbound
// or retention slots. The worker baseline sizes only one process.
export const ACTIVITYPUB_DOMAIN = defineBackgroundDomain({
  domain: 'activitypub',
  workerConcurrency: 10,
})

type DistributeFollowActivityData = {
  activityId: string
  activityType: 'Follow'
  sourceUserId: string
  targetUserId: string
}

type DistributeUndoFollowActivityData = {
  activityId: string
  activityType: 'UndoFollow'
  originalActivityId: string
  sourceUserId: string
  targetUserId: string
}

type DistributeLikeActivityData = {
  activityId: string
  activityType: 'Like'
  sourceUserId: string
  targetPostId: string
}

type DistributeUndoLikeActivityData = {
  activityId: string
  activityType: 'UndoLike'
  originalActivityId: string
  sourceUserId: string
  targetPostId: string
}

export type DistributeActivityData = (
  | DistributeFollowActivityData
  | DistributeUndoFollowActivityData
  | DistributeLikeActivityData
  | DistributeUndoLikeActivityData
) & { cursor?: string; recovery?: true }

// Accept never goes through distributeActivity's fan-out: an inbound Follow's Accept always
// targets exactly one already-known inbox (the sender's).
type DeliverAcceptActivityData = {
  activityId: string
  activityType: 'Accept'
  sourceUserId: string
  inboxUrl: string
  followActivityId: string
  followActorUri: string
}

export type DeliverActivityData =
  | (DistributeActivityData & { inboxUrl: string })
  | DeliverAcceptActivityData

export type ActivityPubInboxDeliveryJob = {
  requestMethod: string
  requestTarget: string
  expectedHost: string
  signatureHeader: string
  digestHeader: string
  dateHeader: string
  contentTypeHeader?: string
  rawBodyBase64: string
  senderHostname: string
  requestDigest: string
  receivedAt: string
  verifiedRemoteActorId?: string
  senderAllowed?: true
}
export type RecoverOutboundDistributionData = {
  source: 'follows' | 'votes'
  cursor?: string
  throughPostId?: string
}
