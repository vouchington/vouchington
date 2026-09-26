import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicParents, getTopicChildren } from '@services/topics/hierarchy'
import { resolveTopic } from './resolve-topic.mts'

type ToolArgs = {
  topic_id: string
  direction?: 'parents' | 'children' | 'both'
}

type TopicSummary = {
  id: string
  name: string
  slug: string
  topic_type: string
}

type ToolResult =
  | {
      success: true
      topic_id: string
      parents: TopicSummary[]
      children: TopicSummary[]
    }
  | {
      success: false
      error: string
    }

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_topic_hierarchy',
    type: 'function',
    description:
      'Get the parent and/or child topics for a given topic. Useful for finding all cards issued by a bank (children of the bank topic), all tiers in a rewards program (children of the program topic), or discovering what organization issues a card (parents of the card topic).',
    parameters: {
      type: 'object',
      properties: {
        topic_id: {
          type: 'string',
          description: 'The topic UUID or slug to look up hierarchy for',
        },
        direction: {
          type: 'string',
          enum: ['parents', 'children', 'both'],
          description:
            'Which direction to traverse. "parents" = what this topic belongs to, "children" = what belongs to this topic, "both" = all relations. Defaults to "both".',
        },
      },
      required: ['topic_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get Topic Hierarchy',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:idOrSlug' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const topic = await resolveTopic(args.topic_id)
      if (!topic) {
        return { success: false, error: 'Topic not found' }
      }

      const direction = args.direction ?? 'both'

      const [parents, children] = await Promise.all([
        direction === 'children' ? [] : getTopicParents(topic.id),
        direction === 'parents' ? [] : getTopicChildren(topic.id),
      ])

      return {
        success: true,
        topic_id: topic.id,
        parents: parents.map(t => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          topic_type: t.topic_type,
        })),
        children: children.map(t => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          topic_type: t.topic_type,
        })),
      }
    },
}

export default tool
