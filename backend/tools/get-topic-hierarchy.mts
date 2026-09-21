import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicParents, getTopicChildren } from '@services/topics/hierarchy'

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

type ToolResult = {
  success: true
  topic_id: string
  parents: TopicSummary[]
  children: TopicSummary[]
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
          description: 'The topic UUID to look up hierarchy for',
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
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics/:idOrSlug' }],
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const direction = args.direction ?? 'both'

      const [parents, children] = await Promise.all([
        direction === 'children' ? [] : getTopicParents(args.topic_id),
        direction === 'parents' ? [] : getTopicChildren(args.topic_id),
      ])

      return {
        success: true,
        topic_id: args.topic_id,
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
