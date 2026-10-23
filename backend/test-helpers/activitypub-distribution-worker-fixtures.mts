import type { DistributeActivityData } from '../queues/activitypub/enqueues/delivery.mts'
import { v7 as uuidv7 } from 'uuid'

export const FOLLOW_DATA: DistributeActivityData = {
  activityId: uuidv7(),
  activityType: 'Follow',
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
}

export const UNDO_FOLLOW_DATA: DistributeActivityData = {
  activityId: uuidv7(),
  activityType: 'UndoFollow',
  originalActivityId: FOLLOW_DATA.activityId,
  sourceUserId: 'user-1',
  targetUserId: 'user-2',
}

export const LIKE_DATA: DistributeActivityData = {
  activityId: uuidv7(),
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
