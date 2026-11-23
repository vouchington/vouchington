import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getSystemUserByUsername } from '@services/users/system-users'
import { assertEntityRelationUpsertAllowed } from '@services/entity-relations/upsert'
import { writeEntityRelations } from '@services/entity-relations/write-relations'
import type { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import {
  createPostTextEmbeddingContent,
  createPostModerationContent,
} from '@services/posts/content'
import { insertStoryPostRecord } from '@services/posts/create-story-post'
import type { BasicUser, PrivateUser } from '@services/users/types'
import { getStoryById } from '@services/feeds/rss-feed-items/get-story-by-id'
import { getPostStoryByStoryId } from './get-post-stories.mts'
import { createPostStory } from './update.mts'
import type { PostStory, Story } from './types.mts'
import type { Post } from '@services/posts/types'
import { recordPostPublicationChange } from '@services/post-publication'
import { markStoryPostRelatedUrlProjection } from './story-post-related-url-projection.mts'
import {
  readStoryPostCreationSources,
  type StoryPostCreationSnapshot,
} from './story-post-creation-sources.mts'

export type CreatedStoryPost = {
  post: Post
  story: Story
  postStory: PostStory
  categoryTopicRelations: Awaited<ReturnType<typeof writeEntityRelations>>
  storyTellerUser: PrivateUser
  categoryTopicRelation: ReturnType<typeof getEntityRelationMetadataOrThrow>
  sourceSnapshot: StoryPostCreationSnapshot
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
  const { rows: activeAuthorRows } = await query<{ id: string }>(
    sql`/* createStoryPost:activeAuthor */
        SELECT id FROM users
        WHERE id = ${storyTellerUser.id} AND platform_account_kind = 'system' AND deleted_at IS NULL`,
  )
  assert(activeAuthorRows[0], 409, 'System user @story-teller is not active')
  const story = await getStoryById(storyId, txOptions)
  assert(story, 404, 'Story not found')
  const existingPostStory = await getPostStoryByStoryId(storyId, txOptions)
  assert(!existingPostStory, 409, 'Story already has a post')
  const sourceSnapshot = await readStoryPostCreationSources(storyId, query)
  assert(
    sourceSnapshot && Number(sourceSnapshot.item_count) >= 2,
    422,
    'Story posts require at least 2 news items',
  )
  const topicIds = sourceSnapshot.topic_ids ?? []
  const title = sourceSnapshot.story_title ?? sourceSnapshot.single_item_title ?? 'Story'
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
  const sourceUpperBoundId = await markStoryPostRelatedUrlProjection(query, post.id, storyId)
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
  return {
    post,
    story,
    postStory,
    categoryTopicRelations,
    storyTellerUser,
    categoryTopicRelation,
    sourceSnapshot: {
      item_count: sourceSnapshot.item_count,
      topic_ids: topicIds,
      sourceUpperBoundId,
    },
  }
}
