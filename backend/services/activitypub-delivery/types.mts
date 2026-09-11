// Duplicated (not imported) from @queues/activitypub-delivery's job-data shapes so this
// business-logic package stays independent of the queue package — services must not depend on
// queues (backend/CLAUDE.md's module-structure layering: services -> modules/data-stores only).
// Field names are kept identical on purpose so a queue job's data satisfies these input types
// structurally, with no adapter code needed at the worker call site.
export type BuildFollowActivityInput = {
  activityId: string
  activityType: 'Follow'
  sourceUserId: string
  targetUserId: string
}

export type BuildUndoFollowActivityInput = {
  activityId: string
  activityType: 'UndoFollow'
  originalActivityId: string
  sourceUserId: string
  targetUserId: string
}

export type BuildLikeActivityInput = {
  activityId: string
  activityType: 'Like'
  sourceUserId: string
  targetPostId: string
}

export type BuildUndoLikeActivityInput = {
  activityId: string
  activityType: 'UndoLike'
  originalActivityId: string
  sourceUserId: string
  targetPostId: string
}

// Acknowledges one inbound Follow. sourceUserId is the local followed user (the Accept's actor);
// followActivityId/followActorUri identify the original inbound Follow being accepted, embedded
// in the Accept's object per the AS2 Follow/Accept handshake.
export type BuildAcceptActivityInput = {
  activityId: string
  activityType: 'Accept'
  sourceUserId: string
  followActivityId: string
  followActorUri: string
}

export type BuildActivityInput =
  | BuildFollowActivityInput
  | BuildUndoFollowActivityInput
  | BuildLikeActivityInput
  | BuildUndoLikeActivityInput
  | BuildAcceptActivityInput

export type OutboundActivityJson = Record<string, unknown>
