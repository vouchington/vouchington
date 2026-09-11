import type { BasicUser, PrivateUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicByAny } from '@services/topics/get'
import { getPostByAny } from '@services/posts/get'
import { getRssFeedItemById } from '@services/rss-feed-items/get'
import { getEntityRelationMetadataOrThrow } from '@services/entity-relations/metadata'
import { upsertEntityRelation } from '@services/entity-relations/upsert'
import { formatToolResult } from '@services/openai-agents'
import { currentUserCanUpdatePost } from '@services/posts/authorization'
import { currentUserCanUpdateRssFeed } from '@services/rss-feeds/authorization'
import { requirePrivateToolUser } from './private-user.mts'
import createHttpError from 'http-errors'

type EntityType = 'post' | 'rss_feed_item'

type ToolArgs = {
  topic_id: string
}

type ToolResult = {
  success: boolean
  error?: string
  topic_id?: string
  topic_name?: string
}

const tool: Tool<ToolArgs, ToolResult, [EntityType, string]> = {
  schema: {
    name: 'add_related_topic',
    type: 'function',
    description: 'Add a related topic relation to the current entity',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'Topic UUID to relate',
        },
      },
      required: ['topic_id'],
    },
    strict: null,
  },
  meta: { surfaces: ['internal'], annotations: { destructiveHint: true }, api: null },
  function:
    (currentUser: BasicUser, entityType: EntityType, entityId: string) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const privateUser = await requirePrivateToolUser(currentUser)
      const { topic_id } = args

      const topic = await getTopicByAny(topic_id)
      if (!topic) {
        throw new Error(`Topic with ID ${topic_id} not found`)
      }

      const entity = await getAuthorizedEntity(privateUser, entityType, entityId)

      const relation = getEntityRelationMetadataOrThrow({
        subjectType: entityType,
        objectType: 'topic',
        predicate: 'category',
      })

      await upsertEntityRelation(privateUser, relation, entity, [topic], { vote: true })

      return {
        success: true,
        topic_id: topic_id,
        topic_name: topic.name,
      }
    },
  formatResult: (callId, result) => {
    if (isErrorResult(result)) {
      return formatToolResult(callId, { success: false, error: result.error })
    }
    return formatToolResult(callId, result)
  },
}

export default tool

async function getAuthorizedEntity(
  currentUser: PrivateUser,
  entityType: EntityType,
  entityId: string,
) {
  switch (entityType) {
    case 'post': {
      const post = await getPostByAny(entityId)
      if (!post) {
        throw new Error(`Post with ID ${entityId} not found`)
      }
      if (isAutotaggerAgent(currentUser) || currentUserCanUpdatePost(currentUser, post)) {
        return post
      }
      throw createHttpError(403, 'Forbidden')
    }
    case 'rss_feed_item': {
      const rssFeedItem = await getRssFeedItemById(entityId)
      if (!rssFeedItem) {
        throw new Error(`RSS feed item with ID ${entityId} not found`)
      }
      if (isAutotaggerAgent(currentUser) || currentUserCanUpdateRssFeed(currentUser)) {
        return rssFeedItem
      }
      throw createHttpError(403, 'Forbidden')
    }
    default:
      throw unsupportedEntityType(entityType)
  }
}

function isAutotaggerAgent(currentUser: PrivateUser): boolean {
  return currentUser.username === 'autotagger' && currentUser.is_agent === true
}

function unsupportedEntityType(entityType: never): Error {
  return createHttpError(422, `Unsupported entity type: ${String(entityType)}`)
}

function isErrorResult(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  )
}
