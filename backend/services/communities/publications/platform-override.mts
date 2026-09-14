import { beginTransaction, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PrivateUser } from '@services/users/types'
import { enqueueCommunityModerationDispatcher } from '@queues/ai-agents/enqueues/community-moderation'
import { enqueueRefreshTopHashtags } from '@queues/psql/enqueues'
import { recordModeratorAction } from '@services/moderator-actions'
import { lockPostPublication } from '@services/post-publication'
import { assertPublicationModeratorAccess, getPublicationReview } from './access.mts'
import { recordCommunityPublicationChange } from './publication-change.mts'
import { recordPublicationReviewChange, type PublicationReviewAction } from './review-change.mts'

export type PlatformPublicationOverrideAction = PublicationReviewAction

export type PlatformPublicationOverride = {
  action: PlatformPublicationOverrideAction
  reasonCode: string
  privateNote?: string
}

export async function overridePublication(
  currentUser: PrivateUser,
  communityId: string,
  postId: string,
  override: PlatformPublicationOverride,
): Promise<void> {
  const access = await assertPublicationModeratorAccess(currentUser, communityId)
  assert(access.isPlatformModerator, 403, 'Forbidden')
  assertReasonCode(override.reasonCode)
  if (override.privateNote) assertReasonText(override.privateNote, 4000, 'Private note')
  assert(await getPublicationReview(communityId, postId), 404, 'Community post review not found')

  await using query = await beginTransaction()
  await lockPostPublication(query, postId)
  const { rowCount } = await write(
    createPlatformOverrideUpdate(communityId, postId, currentUser.id, override),
    { query },
  )
  assert((rowCount ?? 0) > 0, 409, 'Community post review changed concurrently')
  await recordPublicationReviewChange(query, {
    communityId,
    postId,
    actorUserId: currentUser.id,
    action: override.action,
    platformOverride: true,
    reasonCode: override.reasonCode,
    privateNote: override.privateNote,
  })
  await recordCommunityPublicationChange(query, communityId, postId)
  await query.commit()

  const actionType =
    override.action === 'reject' ? 'reject' : override.action === 'unpublish' ? 'remove' : 'approve'
  await recordModeratorAction(currentUser.id, {
    actionType,
    communityId,
    postId,
    reason: override.reasonCode,
  })
  void enqueueRefreshTopHashtags()
  if (override.action === 'approve' || override.action === 'restore') {
    void enqueueCommunityModerationDispatcher(postId, communityId)
  }
}

function createPlatformOverrideUpdate(
  communityId: string,
  postId: string,
  actorUserId: string,
  override: PlatformPublicationOverride,
) {
  const action = override.action
  const isApprove = action === 'approve' || action === 'restore'
  const isReject = action === 'reject'
  return sql`/* overridePublication */
    UPDATE community_post_reviews
    SET reviewed_at = CURRENT_TIMESTAMP,
        reviewed_by_id = ${actorUserId},
        approved_at = CASE WHEN ${isApprove} THEN CURRENT_TIMESTAMP WHEN ${isReject} THEN NULL ELSE approved_at END,
        rejected_at = CASE WHEN ${isReject} THEN CURRENT_TIMESTAMP WHEN ${isApprove} THEN NULL ELSE rejected_at END,
        rejection_reason = CASE WHEN ${isReject} THEN ${override.reasonCode} ELSE NULL END,
        unpublished_at = CASE WHEN ${action === 'unpublish'} THEN CURRENT_TIMESTAMP WHEN ${isApprove || isReject} THEN NULL ELSE unpublished_at END,
        unpublished_by_id = CASE WHEN ${action === 'unpublish'} THEN ${actorUserId} WHEN ${isApprove || isReject} THEN NULL ELSE unpublished_by_id END,
        platform_override_at = CURRENT_TIMESTAMP,
        platform_override_by_id = ${actorUserId},
        platform_override_action = ${action},
        platform_override_reason_code = ${override.reasonCode},
        platform_override_private_note = ${override.privateNote ?? null}
    WHERE community_id = ${communityId}
      AND post_id = ${postId}`
}

function assertReasonCode(reasonCode: string): void {
  assert(/^[a-z][a-z0-9_]{0,99}$/.test(reasonCode), 422, 'Reason code must be a stable identifier')
}

function assertReasonText(value: string, maxLength: number, name: string): void {
  assert(value.trim() === value, 422, `${name} must not have leading or trailing whitespace`)
  assert(value.length <= maxLength, 422, `${name} must be at most ${maxLength} characters`)
}
