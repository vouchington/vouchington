import { recordModerationTrainingFeedback } from '@services/moderation-training'

export function recordPublicationApprovedFeedback(input: {
  actorUserId: string
  communityId: string
  postId: string
  communityTrusted: boolean
}): Promise<unknown> {
  return recordModerationTrainingFeedback({
    sourceType: 'community_review',
    eventType: 'manual_action_inferred',
    label: 'true_negative',
    labelConfidence: 0.7,
    humanAction: 'approve_publication',
    actorUserId: input.actorUserId,
    communityId: input.communityId,
    postId: input.postId,
    metadata: { community_trusted: input.communityTrusted },
  })
}

export function recordPublicationRejectedFeedback(input: {
  actorUserId: string
  communityId: string
  postId: string
  reason?: string
}): Promise<unknown> {
  return recordModerationTrainingFeedback({
    sourceType: 'community_review',
    eventType: 'manual_action_inferred',
    label: 'true_positive',
    labelConfidence: 0.7,
    humanAction: 'reject_publication',
    actorUserId: input.actorUserId,
    communityId: input.communityId,
    postId: input.postId,
    reasonCode: input.reason ? 'moderator_reason' : null,
    note: input.reason ?? null,
  })
}

export function recordPublicationUnpublishedFeedback(input: {
  actorUserId: string
  communityId: string
  postId: string
}): Promise<unknown> {
  return recordModerationTrainingFeedback({
    sourceType: 'community_review',
    eventType: 'manual_action_inferred',
    label: 'true_positive',
    labelConfidence: 0.7,
    humanAction: 'unpublish_post',
    actorUserId: input.actorUserId,
    communityId: input.communityId,
    postId: input.postId,
  })
}
