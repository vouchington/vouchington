import { enqueueCreatePostEmbedding } from '@queues/bedrock-embeddings/enqueues'
import { enqueueCreatePostModeration } from '@queues/openai-moderation/enqueues'
import { enqueuePostMentions } from '@queues/post-mentions/enqueues'
import { enqueuePostAutotaggerFlow } from '@flows/core/enqueues'
import { upsertPostElectionVotes } from '@services/elections-votes/post'
import { getDeletedPostByAny, getPostByAny } from '@services/posts/get'
import { createPostModerationContent } from '@services/posts/content'
import { isOfficialAccount } from '@services/users'
import { getPrivateUserByAny } from '@services/users/get'
import { enqueueDetectBanEvasion } from '@queues/ban-evasion/enqueues'
import { isFirstCommunityPost } from '@services/communities/ban-evasion'
import { enqueueSpamDetection } from '@queues/spam-detection/enqueues'
import { enqueueBulkCommunityModerationDispatchers } from '@queues/ai-agents/enqueues/community-moderation'
import { getApprovedReviewsForPost } from '@services/communities/publications/get'
import onError from '@modules/on-error'
import { enqueueLanguageDetection } from '@queues/language-detection/enqueues'
import { resetPostClearanceIfContentCurrent } from '@services/post-clearance'
import { autoSubscribePostCreator } from './auto-subscribe-post-creator.mts'
import { makeModerationDeduplicationKey } from './moderation-deduplication-key.mts'
import { handlePostCommentAction } from './comment-actions.mts'
import { recoverPostCreatedEffects } from './post-created-recovery.mts'

export const processPostCreated = async (
  { id }: { id: string },
  dependencies: { recoverPostCreatedEffects?: typeof recoverPostCreatedEffects } = {},
) => {
  const post = await getPostByAny(id, { readOnly: false })
  if (!post) return
  const bypassCreateModeration = post.clearance_status === 'approved' && post.post_type !== 'story'
  const { content_sha256 } = createPostModerationContent(post)
  const moderationDeduplicationKey = makeModerationDeduplicationKey(post, content_sha256)
  if (post.created_by_id) {
    const creator = await getPrivateUserByAny(post.created_by_id)
    if (creator && !isOfficialAccount(creator)) {
      await upsertPostElectionVotes(post.created_by_id, [{ entityId: post.id, score: 1 }])
    }
    await autoSubscribePostCreator(post, creator)
  }
  await Promise.all([
    enqueueLanguageDetection('post', post.id),
    enqueueCreatePostEmbedding(post.id),
    enqueuePostMentions(post.id),
    enqueuePostAutotaggerFlow(post.id, { includeModeration: !bypassCreateModeration }),
    !bypassCreateModeration
      ? enqueueSpamDetection(post.id, {
          contentSha256: content_sha256,
          deduplicationKey: moderationDeduplicationKey,
        })
      : Promise.resolve(),
  ])

  if (post.community_id && post.created_by_id) {
    const isFirst = await isFirstCommunityPost(post.community_id, post.created_by_id, post.id)
    if (isFirst) {
      try {
        await enqueueDetectBanEvasion(post.community_id, post.created_by_id, post.id)
      } catch (err) {
        onError(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }

  await handlePostCommentAction(post.id)

  await (dependencies.recoverPostCreatedEffects ?? recoverPostCreatedEffects)(post)
}

export const processPostUpdated = async ({
  id,
  contentChanged,
}: {
  id: string
  contentChanged?: boolean
}) => {
  const post = await getPostByAny(id, contentChanged ? { readOnly: false } : undefined)
  if (!post) return

  const { content_sha256 } = createPostModerationContent(post)
  const moderationDeduplicationKey = makeModerationDeduplicationKey(post, content_sha256)
  if (contentChanged) {
    const reset = await resetPostClearanceIfContentCurrent(id, content_sha256)
    if (!reset) return
    const communityIds = await getApprovedReviewsForPost(id)
    if (communityIds.length > 0) {
      void enqueueBulkCommunityModerationDispatchers(
        communityIds.map(communityId => ({ postId: id, communityId })),
      )
    }
    await enqueueSpamDetection(id, {
      contentSha256: content_sha256,
      deduplicationKey: moderationDeduplicationKey,
    })
  }

  await Promise.all([
    enqueueLanguageDetection('post', id),
    enqueueCreatePostEmbedding(post.id),
    enqueueCreatePostModeration(post.id, { deduplicationKey: moderationDeduplicationKey }),
    enqueuePostMentions(post.id),
  ])

  await handlePostCommentAction(post.id)
}

export const processPostDeleted = async ({ id }: { id: string }) => {
  const post = await getDeletedPostByAny(id)
  await handlePostCommentAction(post?.id ?? id)
}
