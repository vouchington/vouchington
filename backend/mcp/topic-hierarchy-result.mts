import { getPaginationLimitsForContract } from '@services/pagination'
import { getTopicParents } from '@services/topics/hierarchy'
import { getTopicChildrenPage, topicChildrenPaginationParser } from '@services/topics/children-page'
import type { Topic } from '@services/topics/types'
import { objectSchema } from '@vouchington/mcp-server/schema'
import { componentPropertySchema, componentSchema } from './route-response-schema.mts'

const HIERARCHY_DIRECTIONS = ['parents', 'children', 'both'] as const

export type TopicHierarchyArgs = {
  hierarchy?: (typeof HIERARCHY_DIRECTIONS)[number]
  children_after?: string
  children_limit?: number
}

type TopicSummary = { id: string; name: string; slug: string; topic_type: string }

export type TopicHierarchyResult = {
  parents?: TopicSummary[]
  children?: TopicSummary[]
  children_page_info?: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

/** The hierarchy arguments of `read_topic (option details)`. Children are paged; parents are a short list. */
export const HIERARCHY_ARGUMENT_PROPERTIES = {
  hierarchy: {
    type: 'string',
    enum: [...HIERARCHY_DIRECTIONS],
    description: 'Parents, paged children or both.',
  },
  children_after: {
    type: 'string',
    description: 'children_page_info.end_cursor (children/both).',
  },
  children_limit: {
    type: 'integer',
    minimum: 1,
    description: 'Children/both: default 25, clamped to 100.',
  },
}

const TOPIC_SUMMARY_SCHEMA = objectSchema({
  id: { type: 'string' },
  name: { type: 'string' },
  slug: { type: 'string' },
  topic_type: componentPropertySchema('TopicBasic', 'topic_type'),
})

/** The optional hierarchy fields of the `read_topic (option details)` result. */
export const HIERARCHY_OUTPUT_PROPERTIES = {
  parents: { type: 'array', items: TOPIC_SUMMARY_SCHEMA },
  children: { type: 'array', items: TOPIC_SUMMARY_SCHEMA },
  children_page_info: componentSchema('PageInfo'),
}

export const HIERARCHY_OUTPUT_FIELDS = Object.keys(HIERARCHY_OUTPUT_PROPERTIES)

const summarize = (topic: Topic): TopicSummary => ({
  id: topic.id,
  name: topic.name,
  slug: topic.slug,
  topic_type: topic.topic_type,
})

/** The parents and/or one page of children the `hierarchy` argument asks for, or nothing. */
export async function getTopicHierarchyResult(
  topicId: string,
  args: TopicHierarchyArgs,
): Promise<TopicHierarchyResult> {
  if (!args.hierarchy) return {}
  const wantsChildren = args.hierarchy !== 'parents'
  const pagination = wantsChildren
    ? topicChildrenPaginationParser.parse(
        {
          ...(args.children_after !== undefined && { after: args.children_after }),
          ...(args.children_limit !== undefined && { limit: args.children_limit }),
        },
        getPaginationLimitsForContract(topicChildrenPaginationParser.queryContract),
      )
    : null

  const [parents, children] = await Promise.all([
    args.hierarchy === 'children' ? null : getTopicParents(topicId),
    pagination ? getTopicChildrenPage(topicId, pagination) : null,
  ])

  return {
    ...(parents && { parents: parents.map(summarize) }),
    ...(children && {
      children: children.results.map(summarize),
      children_page_info: children.page_info,
    }),
  }
}
