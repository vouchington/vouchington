import type { PrivateUser } from '@services/users/types'
import type { Post, UpdatePostChanges } from './types.mts'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { createPostSlug } from './slugs.mts'
import { getPostByAny } from './get.mts'
import createHttpError from 'http-errors'
import { archivePost, unarchivePost } from './archive.mts'
import { resetPostClearance } from '@services/post-clearance'
import { assertValidPostCategoryUpdate, assertValidPostUpdate } from './update/validation.mts'
import { assertValidAudienceUpdate } from './update/audience.mts'
import { writePostUpdates } from './update/post-update-query.mts'
import { createUpdatePostRevision } from './update/revisions.mts'
import { syncPostDataPointTopicsInTransaction } from './update/data-point-relations.mts'
import { normalizeContentLanguageTag } from '@ts-shared/languages/content-languages'
import { assertCommunityNoLinksAllowed } from '@services/communities/restrictions/enforce'
import sql from 'sql-template-strings'
import { finalizePostUpdateAndDeliver } from './update/post-commit-delivery.mts'
import { lockPostUpdateMutationScopes } from './category-user-locks.mts'
import {
  castSynchronizedPostCategoryVotes,
  synchronizePostCategoriesInTransaction,
} from './update/category-synchronization.mts'
import {
  getPreviousPostPublicationTopicIds,
  recordPostUpdatePublicationChanges,
} from './update/publication-change.mts'
import {
  prepareLockedAdditiveHashtagChanges,
  type AdditiveHashtagIntent,
} from './update/additive-hashtag.mts'
import { mapPostUpdateError } from './update/post-update-error.mts'

export const updatePost = async (
  creator: PrivateUser,
  post: Post,
  requestedChanges: UpdatePostChanges,
  membershipPlan: ContributionLimitMembershipPlan = null,
  additiveIntent?: AdditiveHashtagIntent,
) => {
  await assertValidPostUpdate(creator, post, requestedChanges, membershipPlan, !!additiveIntent)

  let changed = false
  let contentChanged = false
  let shouldEnqueuePostUpdated = false
  let previousPost = post
  let effectiveChanges = requestedChanges
  let syncHashtagCategories = false
  async function updatePostInTransaction() {
    await using query = await beginTransaction()

    async function updatePostRows(query: TransactionQuery) {
      const activeCategoryOwnerId = await lockPostUpdateMutationScopes(
        query,
        post.id,
        creator.id,
        requestedChanges,
        additiveIntent,
      )
      const options = { query }
      await query(sql`/* updatePost.lock */ SELECT id FROM posts WHERE id = ${post.id} FOR UPDATE`)
      const currentPost = await getPostByAny(post.id, options)
      if (!currentPost) throw createHttpError(404, 'Post not found')
      if (additiveIntent)
        effectiveChanges = await prepareLockedAdditiveHashtagChanges(
          creator,
          currentPost,
          requestedChanges,
          additiveIntent,
          options,
        )
      const changes = effectiveChanges
      syncHashtagCategories =
        changes.title !== undefined ||
        changes.markdown !== undefined ||
        changes.categories !== undefined
      await assertValidPostCategoryUpdate(creator, currentPost, changes, membershipPlan, options)
      previousPost = currentPost
      const previousTopicIds = await getPreviousPostPublicationTopicIds(
        query,
        currentPost.id,
        syncHashtagCategories || changes.structured_data !== undefined,
      )
      const hasContentUpdates =
        changes.markdown !== undefined ||
        changes.title !== undefined ||
        changes.structured_data !== undefined
      const hasAiSummaryUpdate =
        changes.ai_summary_markdown !== undefined &&
        changes.ai_summary_markdown !== currentPost.ai_summary_markdown

      if (currentPost.community_id && hasContentUpdates) {
        await assertCommunityNoLinksAllowed({
          communityId: currentPost.community_id,
          currentUser: creator,
          options,
          updates: {
            title: changes.title,
            markdown: changes.markdown,
            structured_data: changes.structured_data,
            url: changes.url,
            url_id: changes.url_id,
          },
        })
      }

      if (changes.slug) {
        await createPostSlug(currentPost, changes.slug, options)
        changed = true
      }

      if (await assertValidAudienceUpdate(currentPost, changes, options)) {
        changed = true
      }

      if (changes.is_anonymous !== undefined && changes.is_anonymous !== currentPost.is_anonymous) {
        changed = true
      }

      if (
        changes.declared_language !== undefined &&
        normalizeContentLanguageTag(changes.declared_language ?? null) !==
          currentPost.declared_language
      ) {
        changed = true
      }

      if (hasContentUpdates || hasAiSummaryUpdate) contentChanged = true

      shouldEnqueuePostUpdated =
        changed || hasContentUpdates || hasAiSummaryUpdate || changes.categories !== undefined

      await writePostUpdates({
        changed,
        changes,
        contentChanged: hasContentUpdates || hasAiSummaryUpdate,
        creatorId: creator.id,
        options,
        post: currentPost,
      })

      if (changes.archive === true) {
        if (!currentPost.archived_at) shouldEnqueuePostUpdated = true
        await archivePost(currentPost.id, creator.id, { ...options, capturePublication: false })
      } else if (changes.archive === false) {
        if (currentPost.archived_at) shouldEnqueuePostUpdated = true
        await unarchivePost(currentPost.id, { ...options, capturePublication: false })
      }

      await Promise.all([
        createUpdatePostRevision(currentPost, changes, creator.id, options),
        syncPostDataPointTopicsInTransaction(currentPost, changes, options),
      ])
      await synchronizePostCategoriesInTransaction({
        changes,
        creator,
        post: currentPost,
        queryOptions: options,
        syncHashtagCategories,
      })
      await castSynchronizedPostCategoryVotes({
        changes,
        creator,
        ownerId: activeCategoryOwnerId,
        post: currentPost,
        query,
        syncHashtagCategories,
      })

      // Keep the clearance reset in this transaction, so edited content is never visible as approved
      // before re-moderation runs.
      if (contentChanged) {
        await resetPostClearance(post.id, creator.id, options)
      }
      await recordPostUpdatePublicationChanges(query, {
        changed,
        changes,
        contentChanged,
        post: currentPost,
        previousTopicIds,
        syncHashtagCategories,
      })

      return getPostByAny(post.id, options)
    }
    const result = await updatePostRows(query)
    await query.commit()
    return result
  }
  const post2 = await updatePostInTransaction().catch(mapPostUpdateError)

  return finalizePostUpdateAndDeliver({
    changes: effectiveChanges,
    contentChanged,
    previousPost,
    shouldEnqueuePostUpdated,
    updatedPost: post2!,
  })
}
