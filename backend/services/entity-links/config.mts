import {
  getUserPublicByAnyCachedBatch,
  getPostByAnyCachedBatch,
  getTopicByAnyCachedBatch,
} from '@services/entity-fetch'
import { getTopicTypeSlugPlural } from '@voucha/types/entities/topic'
import { getUserDisplayName } from '@services/users/display-name'
import { getPostRouteSegment } from './routes.mts'
import type {
  EntityMention,
  ResolvedMention,
  ResolvedPostMention,
  ResolvedTopicMention,
  ResolvedUserMention,
} from './types.mts'

type MentionType = EntityMention['type']

type MentionConfig = {
  type: MentionType
  prefix: string
  className: string
  batchGet: (identifiers: string[]) => Promise<Array<unknown | null>>
  buildResolved: (mention: EntityMention, entity: unknown) => ResolvedMention
  getText: (mention: ResolvedMention) => string
  getTitle: (mention: ResolvedMention) => string
}

export const mentionConfigs = [
  {
    type: 'user',
    prefix: '@',
    className: 'md-link-user',
    batchGet: getUserPublicByAnyCachedBatch,
    buildResolved: (mention, entity) => {
      const user = entity as {
        id: string
        username: string
        display_account?: { name?: string | null } | null
      }
      const displayName = getUserDisplayName(user)
      return {
        type: 'user',
        raw: mention.raw,
        id: user.id,
        username: user.username,
        displayName,
        url: `/user/${user.username}`,
      } satisfies ResolvedUserMention
    },
    getText: mention => (mention as ResolvedUserMention).displayName,
    getTitle: mention => (mention as ResolvedUserMention).displayName,
  },
  {
    type: 'topic',
    prefix: '#',
    className: 'md-link-topic',
    batchGet: getTopicByAnyCachedBatch,
    buildResolved: (mention, entity) => {
      const topic = entity as { id: string; slug: string; name: string; topic_type: string }
      const topicType = getTopicTypeSlugPlural(topic.topic_type)
      return {
        type: 'topic',
        raw: mention.raw,
        id: topic.id,
        slug: topic.slug,
        name: topic.name,
        topicType: topic.topic_type,
        url: `/${topicType}/${topic.slug}`,
      } satisfies ResolvedTopicMention
    },
    getText: mention => (mention as ResolvedTopicMention).name,
    getTitle: mention => (mention as ResolvedTopicMention).name,
  },
  {
    type: 'post',
    prefix: '!',
    className: 'md-link-post',
    batchGet: getPostByAnyCachedBatch,
    buildResolved: (mention, entity) => {
      const post = entity as {
        id: string
        title: string
        post_type: string
        slug?: string | null
      }
      const slug = post.slug || mention.identifier
      const title = post.title || mention.raw
      return {
        type: 'post',
        raw: mention.raw,
        id: post.id,
        slug,
        title,
        postType: post.post_type,
        url: `/${getPostRouteSegment(post.post_type)}/${slug}`,
        displayText: title,
        displayTitle: title,
      } satisfies ResolvedPostMention
    },
    getText: mention => (mention as ResolvedPostMention).displayText,
    getTitle: mention => (mention as ResolvedPostMention).displayTitle,
  },
] as const satisfies MentionConfig[]

export const mentionConfigByType = new Map<MentionType, MentionConfig>(
  mentionConfigs.map(config => [config.type, config]),
)
