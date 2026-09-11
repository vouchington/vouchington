import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from './types.mts'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import createHttpError from 'http-errors'
import type { CommunityPostReview } from '@services/communities/types'
import { getPostByAny } from './get.mts'
import { resolvePostScope } from './create/community-scope.mts'
import { insertPost } from './create/insert-post.mts'
import { applyPostCommitSideEffects } from './create/post-commit-side-effects.mts'
import { applyPostTransactionSideEffects } from './create/transaction-side-effects.mts'
import { validateCreatePostInput, validatePostCategories } from './create/validation.mts'
import { addUrl } from '@services/urls/upsert'
import { getUrlById } from '@services/urls/get'
import { getOrCreateCrawlerForHostname } from '@services/crawlers'
import { invalidate } from '@services/entity-cache'
import { enqueueBulkCrawlUrls } from '@queues/crawler/enqueues'
import { recordCreatedPostPublicationChange } from './create/publication-change.mts'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import type { PostCategoryFinalization } from './post-category-finalizations.mts'
import { persistPostSourceUrlRelation } from './create/source-url-relation.mts'
import { lockAuthorPublicationLifecycle } from '@services/post-publication'
import { assertActivePostAuthor } from './create/active-author.mts'
export const preparePostWithCommunityReviews = async (
  creator: PrivateUser,
  input: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan = null,
  options: { query?: TransactionQuery } = {},
) => {
  const isAdminCreator = creator.roles.includes('administrator')
  const defaults = await validateCreatePostInput(creator, input, membershipPlan)
  const shouldValidateResolvedLinkCategories = defaults.postType === 'link' && !input.title?.trim()
  let communityReviews: CommunityPostReview[] = []
  let postCategoryFinalization: PostCategoryFinalization | undefined
  let resolvedUrlStrings: string[] = []
  let resolvedUrlHostnameId: string | undefined
  let sourceUrlId: string | undefined
  let updates: CreatePostInput = input
  const createInTransaction = async (query: TransactionQuery) => {
    const options = { query }
    await lockAuthorPublicationLifecycle(query, creator.id)
    await assertActivePostAuthor(query, creator.id)
    // Resolve url string → url_id for link posts inside the transaction so the url row
    // is visible to the INSERT. addUrl returns null for blocked/non-public hosts → 422.
    if (defaults.postType === 'link' && updates.url && !updates.url_id) {
      const viewUrl = await addUrl(creator.id, updates.url, { ...options, skipCreatedEvents: true })
      if (!viewUrl) throw createHttpError(422, 'URL is blocked or not allowed')
      updates = { ...updates, url_id: viewUrl.canonical_url_id ?? viewUrl.id }
      sourceUrlId = viewUrl.id
      resolvedUrlStrings = [input.url!]
      // Carry the canonical hostname out for post-commit crawler setup without replica lag.
      if (viewUrl.canonical_url_id) {
        const canonicalUrl = await getUrlById(viewUrl.canonical_url_id, options)
        resolvedUrlHostnameId = canonicalUrl?.hostname.id ?? viewUrl.hostname.id
      } else {
        resolvedUrlHostnameId = viewUrl.hostname.id
      }
      if (!updates.title?.trim()) {
        updates = { ...updates, title: input.url!.slice(0, 255).trim() }
      }
    }
    // Resolve a stored link's title on the writer connection.
    if (defaults.postType === 'link' && updates.url_id && !updates.title?.trim()) {
      const { rows: titleRows } = await query<{ resolved_title: string | null }>(
        sql`/* createPost.resolveLinkTitle */
        SELECT COALESCE(
          (
            SELECT NULLIF(TRIM(rfi.data->>'title'), '')
            FROM rss_feed_items rfi
            WHERE rfi.url_id = ${updates.url_id}
              AND rfi.deleted_at IS NULL
            ORDER BY rfi.id DESC
            LIMIT 1
          ),
          (
            SELECT NULLIF(TRIM(c.title), '')
            FROM crawls c
            WHERE c.url_id = ${updates.url_id}
              AND c.completed_at IS NOT NULL
              AND c.network_error IS NULL
              AND c.response_status_code BETWEEN 200 AND 299
            ORDER BY c.id DESC
            LIMIT 1
          ),
          (SELECT NULLIF(TRIM(u.url), '') FROM urls u WHERE u.id = ${updates.url_id} LIMIT 1)
        ) AS resolved_title`,
      )
      const resolvedTitle = titleRows[0]?.resolved_title
      if (resolvedTitle) {
        updates = { ...updates, title: resolvedTitle.slice(0, 255).trim() }
      }
    }
    if (defaults.postType === 'link' && updates.title && updates.title.length > 255) {
      updates = { ...updates, title: updates.title.slice(0, 255).trim() }
    }
    if (shouldValidateResolvedLinkCategories) {
      await validatePostCategories(creator, membershipPlan, updates)
    }

    // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
    const scope = await resolvePostScope({ creator, defaults, options, updates })
    const insertedPost = await insertPost({
      creator,
      defaults,
      isAdminCreator,
      options,
      scope,
      sourceUrlId,
      updates,
    })
    await persistPostSourceUrlRelation(query, creator, insertedPost.id, sourceUrlId)
    const sideEffects = await applyPostTransactionSideEffects({
      creator,
      options,
      post: insertedPost,
      postType: defaults.postType,
      updates,
    })
    communityReviews = sideEffects.communityReviews
    postCategoryFinalization = sideEffects.postCategoryFinalization
    await recordCreatedPostPublicationChange(
      query,
      insertedPost.id,
      creator.id,
      scope.communityId,
      insertedPost.root_id,
    )
    return getPostByAny(insertedPost.id, options)
  }

  async function createInOwnedTransaction() {
    await using query = await beginTransaction()
    const result = await createInTransaction(query)
    await query.commit()
    return result
  }
  const post = await (
    options.query ? createInTransaction(options.query) : createInOwnedTransaction()
  ).catch(error => {
    const pgError = error as { code?: string; constraint?: string }
    if (pgError.code === '23503') {
      if (
        pgError.constraint === 'post_review_topic_ratings_topic_id_fkey' ||
        pgError.constraint === 'post_data_point_topics_topic_id_fkey'
      ) {
        throw createHttpError(422, 'Topic not found')
      }
      throw createHttpError(422, 'Image not found or not complete')
    }
    throw error
  })

  const response = { post: post!, communityReviews }
  const finalize = async () => {
    // Transactional URL inserts defer cache and crawler work until after commit.
    if (resolvedUrlStrings.length > 0) {
      await invalidate.urls(...resolvedUrlStrings)
      if (updates.url_id && resolvedUrlHostnameId) {
        // Enqueue only after the crawler exists; failures cannot roll back the committed post.
        const urlId = updates.url_id
        await getOrCreateCrawlerForHostname(null, resolvedUrlHostnameId)
          .then(() => {
            void enqueueBulkCrawlUrls([{ urlId }])
          })
          .catch(onError)
      }
    }

    const postRelatedTopics = await applyPostCommitSideEffects({
      communityReviews,
      creator,
      isAdminCreator,
      post: post!,
      postCategoryFinalization: postCategoryFinalization!,
      postType: defaults.postType,
      updates,
    })

    return {
      post:
        postRelatedTopics === undefined
          ? post!
          : { ...post!, post_related_topics: postRelatedTopics },
      communityReviews,
    }
  }

  return { response, finalize }
}

export const createPost = async (
  creator: PrivateUser,
  updates: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan = null,
  options: { query?: TransactionQuery } = {},
) => {
  const prepared = await preparePostWithCommunityReviews(creator, updates, membershipPlan, options)
  return (await prepared.finalize()).post
}
