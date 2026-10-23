import type { ContentProvenance } from '@voucha/types/entities/content-provenance'
import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from './types.mts'
import type { ContributionLimitMembershipPlan } from '@services/contribution-gating/limit-types'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForParentHistory } from '@modules/utils/ids'
import createHttpError from 'http-errors'
import type { CommunityPostReview } from '@services/communities/types'
import { getPostByAny } from './get.mts'
import { resolvePostScope } from './create/community-scope.mts'
import { insertPost } from './create/insert-post.mts'
import { applyPostTransactionSideEffects } from './create/transaction-side-effects.mts'
import { validateCreatePostInput, validatePostCategories } from './create/validation.mts'
import { assessUrls } from '@services/urls/upsert'
import { persistAssessedUrls } from '@services/urls/upsert-persist'
import { prepareUrlHostnamesForOwnedMutation } from '@services/urls-hostnames/upsert'
import { lockHostnameOwnership } from '@services/urls-hostnames/ownership-lock'
import { prepareDelegatedCreateScope } from './create/delegated-create-scope.mts'
import { recordCreatedPostPublicationChange } from './create/publication-change.mts'
import sql from 'sql-template-strings'
import { persistPostSourceUrlRelation } from './create/source-url-relation.mts'
import { lockActivePostAuthorImageAdmission } from './create/active-author.mts'
import { preparePostImageDeliveryMutation } from './media-delivery.mts'
import { enqueueReconcileMediaDeliveryRegistry } from '@queues/notifications/enqueues'
import { assertDelegatedPostActorActive } from './authorization.mts'
import { finalizePreparedPost } from './create/finalize.mts'
export const preparePostWithCommunityReviews = async (
  creator: PrivateUser,
  provenance: ContentProvenance,
  input: CreatePostInput,
  membershipPlan: ContributionLimitMembershipPlan = null,
  options: { query?: TransactionQuery; delegated?: boolean } = {},
) => {
  const isAdminCreator = creator.roles.includes('administrator')
  const defaults = await validateCreatePostInput(creator, input, membershipPlan, {
    query: options.query,
    readOnly: false,
  })
  const shouldValidateResolvedLinkCategories = defaults.postType === 'link' && !input.title?.trim()
  const assessment =
    defaults.postType === 'link' && input.url && !input.url_id
      ? await assessUrls([input.url]).then(
          value => ({ value }),
          (err: unknown) => ({ err }),
        )
      : undefined
  let communityReviews: CommunityPostReview[] = []
  let resolvedUrlStrings: string[] = []
  let resolvedUrlHostnameId: string | undefined
  let sourceUrlId: string | undefined
  let updates: CreatePostInput = input
  const delegated = options.delegated
  const createInTransaction = async (query: TransactionQuery) => {
    if (assessment && 'value' in assessment) {
      const resolved = await prepareUrlHostnamesForOwnedMutation(
        creator.id,
        assessment.value.map(url => url.hostname),
        query,
      )
      await lockHostnameOwnership(query, [...resolved.values()])
    }
    await lockActivePostAuthorImageAdmission(
      query,
      creator.id,
      input.images?.map(image => image.image_id) ?? [],
    )
    await preparePostImageDeliveryMutation(query, {
      imageIds: input.images?.map(image => image.image_id) ?? [],
    })
    const options = { query }
    if (delegated) await assertDelegatedPostActorActive(creator.id, options)
    const delegatedParent = delegated
      ? await prepareDelegatedCreateScope(query, creator, input, defaults.postType)
      : undefined
    if (defaults.postType === 'link' && updates.url && !updates.url_id) {
      if (assessment && 'err' in assessment) throw assessment.err
      const [viewUrl] = await persistAssessedUrls(
        creator.id,
        assessment && 'value' in assessment ? assessment.value : [],
        { ...options, skipCreatedEvents: true },
      )
      if (!viewUrl) throw createHttpError(422, 'URL is blocked or not allowed')
      updates = { ...updates, url_id: viewUrl.canonical_url_id ?? viewUrl.id }
      sourceUrlId = viewUrl.id
      resolvedUrlStrings = [input.url!]
      resolvedUrlHostnameId = viewUrl.canonical_hostname_id ?? viewUrl.hostname.id
      if (!updates.title?.trim()) {
        updates = { ...updates, title: input.url!.slice(0, 255).trim() }
      }
    }
    if (defaults.postType === 'link' && updates.url_id && !updates.title?.trim()) {
      const { rows: titleRows } = await query<{ resolved_title: string | null }>(
        sql`/* createPost.resolveLinkTitle */
        SELECT COALESCE(
          (
            SELECT NULLIF(TRIM(rfi.data->>'title'), '')
            -- no-mistakes-disable-next-line postgres-required-predicates: RSS item URL can change on upsert, so an item may predate its current url_id
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
              AND c.id >= ${getMinUUIDv7ForParentHistory(updates.url_id)}::uuid
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
      await validatePostCategories(creator, membershipPlan, updates, { queryOptions: options })
    }
    const scopeInput = { creator, defaults, options, updates }
    // ast-grep-ignore: no-three-sequential-awaits -- scope validation, insert and source URL relation depend on each other inside the same transaction
    const scope = await resolvePostScope({
      ...scopeInput,
      communityLockHeld: delegated,
      parentPost: delegatedParent,
    })
    const insertedPost = await insertPost({
      creator,
      provenance,
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
    await recordCreatedPostPublicationChange(
      query,
      insertedPost.id,
      creator.id,
      scope.communityId,
      insertedPost.root_post_id,
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
  ).catch(err => {
    const pgError = err as { code?: string; constraint?: string }
    if (pgError.code === '23503') {
      if (
        pgError.constraint === 'post_review_topic_ratings_topic_id_fkey' ||
        pgError.constraint === 'post_data_point_topics_topic_id_fkey'
      ) {
        throw createHttpError(422, 'Topic not found')
      }
      throw createHttpError(422, 'Image not found or not complete')
    }
    throw err
  })
  const response = { post: post!, communityReviews }
  const finalize = async () => {
    void enqueueReconcileMediaDeliveryRegistry()
    return finalizePreparedPost({
      communityReviews,
      creator,
      post: post!,
      postType: defaults.postType,
      resolvedUrlHostnameId,
      resolvedUrlStrings,
      updates,
    })
  }
  return { response, finalize }
}
