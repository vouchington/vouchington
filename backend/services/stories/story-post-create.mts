import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getSystemUserByUsername } from '@services/users/system-users'
import { assertEntityRelationUpsertAllowed } from '@services/entity-relations/upsert'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  createPostTextEmbeddingContent,
  createPostModerationContent,
} from '@services/posts/content'
import { insertStoryPostRecord } from '@services/posts/create-story-post'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { getStoryById } from './get.mts'
import { getPostStoryByStoryId } from './get-post-stories.mts'
import { createPostStory } from './update.mts'
import type { PostStory, Story } from './types.mts'
import type { Post } from '@services/posts/types'
import {
  lockAuthorPublicationLifecycle,
  recordPostPublicationChange,
} from '@services/post-publication'
import { lockStoryLifecycles } from '@services/post-publication/story-lifecycle-lock'
import { deliverStoryPost, type StoryPostDeliveryDependencies } from './story-post-delivery.mts'
import { markStoryPostRelatedUrlProjection } from './story-post-related-url-projection.mts'

export type StoryPostCreateDependencies = Partial<StoryPostDeliveryDependencies> & {
  getStoryTeller?: () => Promise<BasicUser | null>
}

export type CreatedStoryPost = {
  post: Post
  story: Story
  postStory: PostStory
  categoryTopicRelations: Awaited<ReturnType<typeof writeEntityRelations>>
  storyTellerUser: PrivateUser
  categoryTopicRelation: ReturnType<typeof getEntityRelationMetadataOrThrow>
}

export async function loadStoryTellerUser(
  getStoryTeller?: () => Promise<BasicUser | null>,
): Promise<PrivateUser> {
  const systemUser = getStoryTeller
    ? await getStoryTeller()
    : await getSystemUserByUsername('story-teller')
  assert(systemUser, 500, 'System user @story-teller not found')
  return {
    __entity_type: 'user' as const,
    id: systemUser.id,
    username: systemUser.username,
    use_display_name_from: systemUser.use_display_name_from,
    roles: [] as readonly string[],
  } as unknown as PrivateUser
}

export async function createStoryPostInOwnedTransaction(
  storyId: string,
  initiatedBy: PrivateUser,
  aiSummaryMarkdown: string,
  storyTellerUser: PrivateUser,
  categoryTopicRelation: CreatedStoryPost['categoryTopicRelation'],
): Promise<CreatedStoryPost> {
  await using query = await beginTransaction()
  const result = await createStoryPostInTransaction(
    storyId,
    initiatedBy,
    aiSummaryMarkdown,
    storyTellerUser,
    categoryTopicRelation,
    query,
  )
  await query.commit()
  return result
}

export async function createStoryPostInTransaction(
  storyId: string,
  initiatedBy: PrivateUser,
  aiSummaryMarkdown: string,
  storyTellerUser: PrivateUser,
  categoryTopicRelation: CreatedStoryPost['categoryTopicRelation'],
  query: TransactionQuery,
): Promise<CreatedStoryPost> {
  const txOptions = { query }
  await lockAuthorPublicationLifecycle(query, storyTellerUser.id)
  const { rows: activeAuthorRows } = await query<{ id: string }>(
    sql`/* createStoryPost:activeAuthor */
        SELECT id FROM users
        WHERE id = ${storyTellerUser.id} AND is_system = TRUE AND deleted_at IS NULL`,
  )
  assert(activeAuthorRows[0], 409, 'System user @story-teller is not active')
  await lockStoryLifecycles(query, [storyId])
  const story = await getStoryById(storyId, txOptions)
  assert(story, 404, 'Story not found')
  const existingPostStory = await getPostStoryByStoryId(storyId, txOptions)
  assert(!existingPostStory, 409, 'Story already has a post')
  const { rows } = await query(
    sql`/* createStoryPost:items */
        SELECT
          ARRAY_AGG(DISTINCT c.topic_id) FILTER (WHERE c.topic_id IS NOT NULL) AS topic_ids,
          COUNT(DISTINCT rfi.id) AS item_count,
          MAX(CASE WHEN rfi.data->>'title' IS NOT NULL AND rfi.data->>'title' <> '' THEN rfi.data->>'title' END) AS single_item_title,
          s.title AS story_title
        FROM stories s
        LEFT JOIN rss_feed_items rfi ON rfi.story_id = s.id AND rfi.deleted_at IS NULL
        LEFT JOIN rss_feed_item_categories c ON c.rss_feed_item_id = rfi.id AND c.topic_id IS NOT NULL
        WHERE s.id = ${storyId}
        GROUP BY s.title`,
  )
  const topicIds = (rows[0]?.topic_ids as string[] | null) ?? []
  assert(Number(rows[0]?.item_count ?? 0) >= 2, 422, 'Story posts require at least 2 news items')
  const title =
    (rows[0]?.story_title as string | null) ??
    (rows[0]?.single_item_title as string | null) ??
    'Story'
  const post = await insertStoryPostRecord(
    {
      title,
      aiSummaryMarkdown,
      createdById: storyTellerUser.id,
      embeddingContentSha: createPostTextEmbeddingContent({
        title,
        markdown: '',
        ai_summary_markdown: aiSummaryMarkdown,
      }).content_sha256,
      moderationContentSha: createPostModerationContent({
        title,
        markdown: '',
        ai_summary_markdown: aiSummaryMarkdown,
        images: [],
      }).content_sha256,
    },
    txOptions,
  )
  const postStory = await createPostStory(post.id, storyId, initiatedBy.id, txOptions)
  assert(postStory, 409, 'Story already has a post')
  await markStoryPostRelatedUrlProjection(query, post.id, storyId)
  const categoryTopicObjects: Array<{ id: string }> = []
  for (const id of topicIds) categoryTopicObjects.push({ id })
  if (categoryTopicObjects.length > 0) {
    await assertEntityRelationUpsertAllowed(
      storyTellerUser,
      categoryTopicRelation,
      post,
      categoryTopicObjects,
      txOptions,
    )
  }
  const categoryTopicRelationInputs: Array<{ subject: Post; object: { id: string } }> = []
  for (const object of categoryTopicObjects) {
    categoryTopicRelationInputs.push({ subject: post, object })
  }
  const categoryTopicRelations = await writeEntityRelations(
    categoryTopicRelation,
    storyTellerUser,
    categoryTopicRelationInputs,
    { ...txOptions, capturePublication: false },
  )
  await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: post.id },
    reason: 'post_created',
    impactedTopicIds: topicIds,
    footprint: { priorAuthorUserId: storyTellerUser.id },
  })
  return { post, story, postStory, categoryTopicRelations, storyTellerUser, categoryTopicRelation }
}

export function finalizeCreatedStoryPost(
  created: CreatedStoryPost,
  dependencies: StoryPostCreateDependencies,
): Promise<void> {
  return deliverStoryPost(
    {
      post: created.post,
      postStory: created.postStory,
      storyTellerUser: created.storyTellerUser,
      relationEffects: {
        relatedUrlRelation: getEntityRelationMetadataOrThrow({
          subjectType: 'post',
          objectType: 'url',
          predicate: 'related',
        }),
        relatedUrlRelations: [],
        categoryTopicRelation: created.categoryTopicRelation,
        categoryTopicRelations: created.categoryTopicRelations,
      },
    },
    dependencies,
  )
}
