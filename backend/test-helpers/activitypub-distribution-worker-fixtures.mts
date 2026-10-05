import type { DistributeActivityData } from '../queues/activitypub-delivery/enqueues.mts'

export const FOLLOW_DATA: DistributeActivityData = {
  activityId: 'activity-1',
  activityType: 'Follow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
}

export const UNDO_FOLLOW_DATA: DistributeActivityData = {
  activityId: 'activity-3',
  activityType: 'UndoFollow',
  originalActivityId: 'activity-1',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
}

export const LIKE_DATA: DistributeActivityData = {
  activityId: 'activity-2',
  activityType: 'Like',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
}

export const LEGACY_UNDO_FOLLOW_DATA = {
  activityId: 'legacy-undo-follow',
  activityType: 'UndoFollow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
} as unknown as DistributeActivityData

export const LEGACY_UNDO_LIKE_DATA = {
  activityId: 'legacy-undo-like',
  activityType: 'UndoLike',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
} as unknown as DistributeActivityData

export const BLANK_UNDO_LIKE_DATA: DistributeActivityData = {
  activityId: 'blank-undo-like',
  activityType: 'UndoLike',
  originalActivityId: '   ',
  sourceUserId: 'user-1',
  targetPostId: 'post-1',
}
