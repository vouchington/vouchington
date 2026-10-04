import { getPaginationLimitsForContract } from '@services/pagination'
import { getTopicParents } from '@services/topics/hierarchy'
import { getTopicChildrenPage, topicChildrenPaginationParser } from '@services/topics/children-page'
import type { Topic } from '@services/topics/types'
import { objectSchema } from './output-schema-shapes.mts'
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

/** The hierarchy arguments of `get_topic_details`. Children are paged; parents are a short list. */
export const HIERARCHY_ARGUMENT_PROPERTIES = {
  hierarchy: {
    type: 'string',
    enum: [...HIERARCHY_DIRECTIONS],
    description:
      'Also return related topics. "parents" = what this topic belongs to (for example the bank that issues a card), "children" = what belongs to this topic (for example every card a bank issues), "both" = each. Omit for no related topics.',
  },
  children_after: {
    type: 'string',
    description:
      'Cursor from a previous result children_page_info.end_cursor, for the next page of children. Only used when hierarchy is "children" or "both".',
  },
  children_limit: {
    type: 'integer',
    minimum: 1,
    description:
      'Maximum number of children per page. Defaults to 25; values over 100 are clamped to 100. Only used when hierarchy is "children" or "both".',
  },
}

const TOPIC_SUMMARY_SCHEMA = objectSchema({
  id: { type: 'string' },
  name: { type: 'string' },
  slug: { type: 'string' },
  topic_type: componentPropertySchema('TopicBasic', 'topic_type'),
})

/** The optional hierarchy fields of the `get_topic_details` result. */
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
