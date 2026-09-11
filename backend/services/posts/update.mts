import type { PrivateUser } from '@services/users/types'
import type { Post, UpdatePostChanges } from './types.mts'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { beginTransaction } from '@data-stores/psql'
import type { TransactionQuery } from '@data-stores/psql/types'
import { createPostSlug } from './slugs.mts'
import { getPostByAny } from './get.mts'
import createHttpError from 'http-errors'
import { archivePost, unarchivePost } from './archive.mts'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { normalizeKey } from '@ts-shared/utils/strings'
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
import { type PostCategoryFinalization } from './post-category-finalizations.mts'
import { synchronizePostCategoriesInTransaction } from './update/category-synchronization.mts'
import {
  getPreviousPostPublicationTopicIds,
  recordPostUpdatePublicationChanges,
} from './update/publication-change.mts'
import { lockPostPublication } from '@services/post-publication'

export const updatePost = async (
  creator: PrivateUser,
  post: Post,
  changes: UpdatePostChanges,
  membershipPlan: ContributionLimitMembershipPlan = null,
) => {
  await assertValidPostUpdate(creator, post, changes, membershipPlan)

  let changed = false
  let contentChanged = false
  let shouldEnqueuePostUpdated = false
  let previousPost = post
  let previousTopicIds: string[] = []
  let postCategoryFinalization: PostCategoryFinalization | undefined
  const syncHashtagCategories =
    changes.title !== undefined ||
    changes.markdown !== undefined ||
    changes.categories !== undefined
  async function updatePostInTransaction() {
    await using query = await beginTransaction()
    async function updatePostRows(query: TransactionQuery) {
      await query(
        sql`/* updatePost.lockActiveUser */ SELECT fn_lock_active_user_for_mutation(${creator.id})`,
      )
      await lockPostPublication(query, post.id)
      const options = { query }
      await query(sql`/* updatePost.lock */ SELECT id FROM posts WHERE id = ${post.id} FOR UPDATE`)
      const currentPost = await getPostByAny(post.id, options)
      if (!currentPost) throw createHttpError(404, 'Post not found')
      await assertValidPostCategoryUpdate(creator, currentPost, changes, membershipPlan, options)
      previousPost = currentPost
      previousTopicIds = await getPreviousPostPublicationTopicIds(
        query,
        currentPost.id,
        syncHashtagCategories || changes.structured_data !== undefined,
      )
      {
        // posts
        // Both title/markdown and structured_data changes affect moderation payload
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

        if (
          changes.is_anonymous !== undefined &&
          changes.is_anonymous !== currentPost.is_anonymous
        ) {
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
      }

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
      postCategoryFinalization = await synchronizePostCategoriesInTransaction({
        changes,
        creator,
        post: currentPost,
        queryOptions: options,
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
  const post2 = await updatePostInTransaction().catch(error => {
    const pgError = error as { code?: string; constraint?: string }
    if (pgError.code === '23503' && pgError.constraint === 'post_data_point_topics_topic_id_fkey') {
      throw createHttpError(422, 'Topic not found')
    }
    throw error
  })

  if (changes.slug && post2!.slug) {
    entityCacheBloomFilters.posts.add([normalizeKey(post2!.slug)])
  }

  return finalizePostUpdateAndDeliver({
    changes,
    contentChanged,
    previousPost,
    shouldEnqueuePostUpdated,
    syncHashtagCategories,
    postCategoryFinalization,
    updatedPost: post2!,
  })
}
