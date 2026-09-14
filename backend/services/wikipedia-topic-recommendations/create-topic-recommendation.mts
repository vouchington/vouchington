import { getPostByAny } from '@services/posts'
import type { BasicUser } from '@voucha/types/entities/user'
import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { assertValidCreateTopicRecommendationInput } from './shared.mts'
import type { CreateTopicRecommendationInput, TopicRecommendationPost } from './types.mts'
import { createPostModerationContent } from '@services/posts/content'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { normalizeKey } from '@ts-shared/utils/strings'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'
import assert from 'http-assert'
import {
  materializeTopicRecommendationInput,
  replaceTopicRecommendationHostnames,
  type MaterializedTopicRecommendationInput,
} from './materialize-topic-recommendation.mts'
import { setPostClearanceStatus } from '@services/post-clearance'
import { createCodedError } from '@modules/on-error/create-coded-error'
import { DUPLICATE_RECOMMENDATION, DUPLICATE_TOPIC } from '@modules/on-error/error-codes'
import { createSlugFromTitle } from '@modules/utils/slugs'
import { findTopicRecommendationDuplicates } from './find-topic-recommendation-duplicates.mts'
import { recordTopicRecommendationCreateRevision } from './record-create-revision.mts'
import { insertTopicRecommendationExtensionRow } from './insert-extension-row.mts'

type CreateTopicRecommendationOptions = QueryOptions & {
  assertContributionLimit?: () => Promise<void>
  skipCreatedEvents?: boolean
}

export async function createTopicRecommendation(
  currentUser: BasicUser,
  input: CreateTopicRecommendationInput,
  options: CreateTopicRecommendationOptions = {},
): Promise<TopicRecommendationPost> {
  assertValidCreateTopicRecommendationInput(input)

  const queryOptions = options.query
    ? { ...options, query: options.query }
    : options.client
      ? options
      : null
  let post: TopicRecommendationPost | null
  if (queryOptions) {
    post = await createTopicRecommendationInStore(currentUser, input, queryOptions)
  } else {
    await using query = await beginTransaction()
    post = await createTopicRecommendationInStore(currentUser, input, { ...options, query })
    await query.commit()
  }
  assert(post, 500, 'Failed to load created topic recommendation')

  if (options.skipCreatedEvents) return post

  entityCacheBloomFilters.posts.add([normalizeKey(post.id)])
  void enqueueOnPostCreated(post.id)

  return post
}

export async function prepareTopicRecommendation(
  currentUser: BasicUser,
  input: CreateTopicRecommendationInput,
  options: CreateTopicRecommendationOptions = {},
): Promise<{ response: TopicRecommendationPost; finalize: () => Promise<void> }> {
  const post = await createTopicRecommendation(currentUser, input, {
    ...options,
    skipCreatedEvents: true,
  })
  return {
    response: post,
    finalize: async () => {
      entityCacheBloomFilters.posts.add([normalizeKey(post.id)])
      void enqueueOnPostCreated(post.id)
    },
  }
}

async function createTopicRecommendationInStore(
  currentUser: BasicUser,
  input: CreateTopicRecommendationInput,
  options: CreateTopicRecommendationOptions,
): Promise<TopicRecommendationPost> {
  const slugKey = `topic-recommendation:${(input.topic_slug?.toLowerCase().trim() ?? createSlugFromTitle(input.topic_title)) || input.topic_title}`
  await write(
    sql`/* createTopicRecommendationInStore */ SELECT pg_advisory_xact_lock(hashtext(${slugKey}))`,
    options,
  )

  const { exact_topic, pending_recommendations } = await findTopicRecommendationDuplicates(
    {
      topic_title: input.topic_title,
      topic_slug: input.topic_slug ?? createSlugFromTitle(input.topic_title) ?? '',
      topic_aliases: input.topic_aliases,
      skipSimilarTopics: true,
      skipTitleMatchInPending: true,
    },
    options,
  )

  if (exact_topic) {
    throw createCodedError(409, `A topic already exists for "${exact_topic.name}"`, DUPLICATE_TOPIC)
  }
  if (pending_recommendations.length > 0) {
    throw createCodedError(
      409,
      'A pending recommendation already exists for this topic',
      DUPLICATE_RECOMMENDATION,
    )
  }

  await options.assertContributionLimit?.()

  const materialized = await materializeTopicRecommendationInput(currentUser.id, input, options)
  const moderationContentSha = createPostModerationContent({
    title: materialized.title,
    markdown: materialized.markdown,
    images: [],
  }).content_sha256

  // ast-grep-ignore: no-three-sequential-awaits -- service workflow has dependent validation, mutation, and follow-up side effects
  const postId = await insertTopicRecommendationPost(
    currentUser,
    materialized,
    moderationContentSha,
    options,
  )

  await insertTopicRecommendationExtensionRow(postId, materialized, options)
  await replaceTopicRecommendationHostnames(postId, materialized.hostname_ids, options)

  const reloaded = await getPostByAny(postId, options)
  assert(
    reloaded?.post_type === 'topic_recommendation' && reloaded.topic_recommendation,
    500,
    'Failed to load created topic recommendation',
  )
  await recordTopicRecommendationCreateRevision(
    reloaded as TopicRecommendationPost,
    currentUser.id,
    options,
  )
  return reloaded as TopicRecommendationPost
}

async function insertTopicRecommendationPost(
  currentUser: BasicUser,
  materialized: MaterializedTopicRecommendationInput,
  moderationContentSha: Buffer,
  options: QueryOptions,
): Promise<string> {
  const { rows } = await write(
    sql`/* insertTopicRecommendationPost */
      INSERT INTO posts (
        post_type,
        title,
        markdown,
        created_by_id,
        parent_id,
        root_id,
        broadcast,
        privacy,
        is_anonymous,
        bedrock_nova_multimodal_v1_content_sha256,
        llm_moderation_content_sha256
      )
      VALUES (
        'topic_recommendation',
        ${materialized.title},
        ${materialized.markdown},
        ${currentUser.id},
        NULL,
        NULL,
        'users',
        'private',
        false,
        ${materialized.embedding_content_sha},
        ${moderationContentSha}
      )
      RETURNING id
    `,
    options,
  )

  const postId = rows[0]!.id as string
  await setPostClearanceStatus(postId, 'approved', currentUser.id, options)
  return postId
}
