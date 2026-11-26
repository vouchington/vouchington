import type { TransactionQuery } from '@data-stores/psql'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import type { BasicUser, PrivateUser } from '@services/users/types'
import type { Post } from '@services/posts/types'
import type { PostStory, Story } from './types.mts'
import {
  createStoryPostInOwnedTransaction,
  createStoryPostInTransaction,
  loadStoryTellerUser,
  type CreatedStoryPost,
} from './story-post-create.mts'
import { finalizeCreatedStoryPost } from './story-post-delivery.mts'

export type StoryPostResult = {
  post: Post
  story: Story
  postStory: PostStory
}
type PreparedStoryPost = {
  response: StoryPostResult
  created: CreatedStoryPost
  finalize: typeof finalizePreparedStoryPost
}

function finalizePreparedStoryPost(this: PreparedStoryPost): Promise<void> {
  return finalizeCreatedStoryPost(this.created)
}

export async function prepareStoryPost(
  storyId: string,
  initiatedBy: PrivateUser,
  options: { ai_summary_markdown?: string; query?: TransactionQuery } = {},
  dependencies: { getStoryTeller?: () => Promise<BasicUser | null> } = {},
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
    finalize: finalizePreparedStoryPost,
  }
}
