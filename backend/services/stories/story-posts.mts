import type { TransactionQuery } from '@data-stores/psql'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { PrivateUser } from '@services/users/types'
import type { Post } from '@services/posts/types'
import type { PostStory, Story } from './types.mts'
import {
  createStoryPostInOwnedTransaction,
  createStoryPostInTransaction,
  finalizeCreatedStoryPost,
  loadStoryTellerUser,
  type CreatedStoryPost,
  type StoryPostCreateDependencies,
} from './story-post-create.mts'

export type StoryPostResult = {
  post: Post
  story: Story
  postStory: PostStory
}
export type PreparedStoryPost = {
  response: StoryPostResult
  created: CreatedStoryPost
  dependencies: StoryPostCreateDependencies
  finalize: typeof finalizePreparedStoryPost
}

function finalizePreparedStoryPost(this: PreparedStoryPost): Promise<void> {
  return finalizeCreatedStoryPost(this.created, this.dependencies)
}

export async function prepareStoryPost(
  storyId: string,
  initiatedBy: PrivateUser,
  options: { ai_summary_markdown?: string; query?: TransactionQuery } = {},
  dependencies: StoryPostCreateDependencies = {},
): Promise<PreparedStoryPost> {
  const storyTellerUser = await loadStoryTellerUser(dependencies.getStoryTeller)
  const categoryTopicRelation = getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic',
    predicate: 'category',
  })
  const created = options.query
    ? await createStoryPostInTransaction(
        storyId,
        initiatedBy,
        options.ai_summary_markdown ?? '',
        storyTellerUser,
        categoryTopicRelation,
        options.query,
      )
    : await createStoryPostInOwnedTransaction(
        storyId,
        initiatedBy,
        options.ai_summary_markdown ?? '',
        storyTellerUser,
        categoryTopicRelation,
      )
  return {
    response: { post: created.post, story: created.story, postStory: created.postStory },
    created,
    dependencies,
    finalize: finalizePreparedStoryPost,
  }
}

export async function createStoryPost(
  storyId: string,
  initiatedBy: PrivateUser,
  options: { ai_summary_markdown?: string; query?: TransactionQuery } = {},
  dependencies: StoryPostCreateDependencies = {},
): Promise<StoryPostResult> {
  const prepared = await prepareStoryPost(storyId, initiatedBy, options, dependencies)
  await prepared.finalize()
  return prepared.response
}
