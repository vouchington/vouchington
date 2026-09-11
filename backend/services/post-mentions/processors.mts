import { getPostByAny } from '@services/posts/get'
import { parseEntityMentions, resolveEntityMentions } from '@services/entity-links'
import { entityRelationMetadatum } from '@services/entity-relations/metadata'
import { getExistingMentionedRelations } from '@services/entity-relations/mentioned'
import {
  upsertEntityRelationsForSubjects,
  softDeleteEntityRelationsForSubjects,
} from '@services/entity-relations'
import { getSystemUser, type PrivateUser } from '@services/users'

type ProcessPostMentionsData = {
  postId: string
}

// Cache relation metadata lookups at module level since they never change
const USER_MENTIONED_RELATION = entityRelationMetadatum.find(
  r => r.subject_type === 'user' && r.object_type === 'post' && r.predicate === 'mentioned',
)
const TOPIC_MENTIONED_RELATION = entityRelationMetadatum.find(
  r => r.subject_type === 'topic' && r.object_type === 'post' && r.predicate === 'mentioned',
)
const POST_MENTIONED_RELATION = entityRelationMetadatum.find(
  r => r.subject_type === 'post' && r.object_type === 'post' && r.predicate === 'mentioned',
)

/**
 * Process entity mentions in a post's title and markdown content.
 * Creates/updates/deletes entity relations based on @username, #topic, and !post mentions.
 */
export async function processPostMentions(data: ProcessPostMentionsData): Promise<void> {
  const { postId } = data

  // Get the post
  const post = await getPostByAny(postId)
  if (!post) {
    // Post not found, skip processing (may have been deleted)
    return
  }

  // Get system user for creating relations
  const systemUser = await getSystemUser()
  if (!systemUser) {
    // System user not found, skip processing
    return
  }

  // Parse mentions from title and markdown
  const titleMentions = parseEntityMentions(post.title || '')
  const markdownMentions = parseEntityMentions(post.markdown || '')
  const allMentions = [...titleMentions, ...markdownMentions]

  // Resolve entity mentions
  const resolvedMentions = await resolveEntityMentions(allMentions)

  // Extract entity IDs from the resolved mentions
  const mentionedUserIds = new Set<string>()
  const mentionedTopicIds = new Set<string>()
  const mentionedPostIds = new Set<string>()

  for (const mention of resolvedMentions) {
    if (mention.type === 'user') {
      mentionedUserIds.add(mention.id)
    } else if (mention.type === 'topic') {
      mentionedTopicIds.add(mention.id)
    } else if (mention.type === 'post') {
      mentionedPostIds.add(mention.id)
    }
  }

  // Get existing mentioned relations for this post
  const existingRelations = await getExistingMentionedRelations(postId)

  // Upsert new mentions
  await upsertMentions(systemUser, postId, {
    users: [...mentionedUserIds],
    topics: [...mentionedTopicIds],
    posts: [...mentionedPostIds],
  })

  // Delete mentions that were removed
  await deleteMentions(systemUser, postId, existingRelations, {
    users: mentionedUserIds,
    topics: mentionedTopicIds,
    posts: mentionedPostIds,
  })
}

/**
 * Upsert mentioned relations
 */
async function upsertMentions(
  systemUser: PrivateUser,
  postId: string,
  mentions: {
    users: string[]
    topics: string[]
    posts: string[]
  },
) {
  // Upsert user mentions: each user is the subject, this post is the object
  if (USER_MENTIONED_RELATION) {
    await upsertEntityRelationsForSubjects(
      systemUser,
      USER_MENTIONED_RELATION,
      mentions.users.map(userId => ({ id: userId })),
      { id: postId },
    )
  }

  // Upsert topic mentions: each topic is the subject, this post is the object
  if (TOPIC_MENTIONED_RELATION) {
    await upsertEntityRelationsForSubjects(
      systemUser,
      TOPIC_MENTIONED_RELATION,
      mentions.topics.map(topicId => ({ id: topicId })),
      { id: postId },
    )
  }

  // Upsert post mentions: each mentioned post is the subject, this post is the object
  if (POST_MENTIONED_RELATION) {
    await upsertEntityRelationsForSubjects(
      systemUser,
      POST_MENTIONED_RELATION,
      mentions.posts.map(mentionedPostId => ({ id: mentionedPostId })),
      { id: postId },
    )
  }
}

/**
 * Delete mentions that were removed from the post
 */
async function deleteMentions(
  systemUser: PrivateUser,
  postId: string,
  existing: {
    users: string[]
    topics: string[]
    posts: string[]
  },
  current: {
    users: Set<string>
    topics: Set<string>
    posts: Set<string>
  },
) {
  // Delete removed user mentions: each user is the subject, this post is the object
  const removedUsers = existing.users.filter(id => !current.users.has(id))
  if (USER_MENTIONED_RELATION) {
    await softDeleteEntityRelationsForSubjects(
      systemUser,
      USER_MENTIONED_RELATION,
      removedUsers.map(userId => ({ id: userId })),
      { id: postId },
    )
  }

  // Delete removed topic mentions: each topic is the subject, this post is the object
  const removedTopics = existing.topics.filter(id => !current.topics.has(id))
  if (TOPIC_MENTIONED_RELATION) {
    await softDeleteEntityRelationsForSubjects(
      systemUser,
      TOPIC_MENTIONED_RELATION,
      removedTopics.map(topicId => ({ id: topicId })),
      { id: postId },
    )
  }

  // Delete removed post mentions: each mentioned post is the subject, this post is the object
  const removedPosts = existing.posts.filter(id => !current.posts.has(id))
  if (POST_MENTIONED_RELATION) {
    await softDeleteEntityRelationsForSubjects(
      systemUser,
      POST_MENTIONED_RELATION,
      removedPosts.map(mentionedPostId => ({ id: mentionedPostId })),
      { id: postId },
    )
  }
}
