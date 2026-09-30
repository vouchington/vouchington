import type { BasicUser } from '@services/users/types'
import type { Tool } from './types.mts'
import { getTopicIds } from '@services/topics/search/get-ids'
import { prepareTopicsSearchParams, resolveTopicsSearchParams } from '@services/search-params'
import {
  EMPTY_PAGE_INFO,
  pagedSearchQuery,
  pagedSearchSchemaProperties,
  type PagedSearchArgs,
  type SearchPageInfo,
} from './paged-search.mts'
import { objectSchema, successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

type ToolArgs = PagedSearchArgs

type ToolResult = {
  success: true
  topics: Array<{
    id: string
    name: string
    slug: string
  }>
  page_info: SearchPageInfo
}

// The REST twin documents no response body for this route, so the tool owns the schema. `page_info`
// is the generated PageInfo component, the same one GET /api/v1/posts documents.
const OUTPUT_SCHEMA = successSchema({
  topics: {
    type: 'array',
    items: objectSchema({
      id: { type: 'string' },
      name: { type: 'string' },
      slug: { type: 'string' },
    }),
  },
  page_info: componentSchema('PageInfo'),
})

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'search_topics',
    type: 'function',
    description:
      'Search topics by name or slug (text_search_query or q), by meaning (semantic_search_query), and by similar-item signals. Use search for hybrid text+semantic search. Returns page_info.end_cursor; pass it as after to get the next page.',
    parameters: {
      type: 'object',
      properties: pagedSearchSchemaProperties(
        'Keyword search. Same as GET /api/v1/topics q: matches topic names and slugs, and #hashtags.',
      ),
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Search Topics',
    requiredScopes: { mcp: ['topics:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/topics' }],
    outputSchema: OUTPUT_SCHEMA,
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const prepared = prepareTopicsSearchParams(pagedSearchQuery(args))
      const { shouldReturnEmpty, searchOptions } = await resolveTopicsSearchParams(prepared)
      if (shouldReturnEmpty) return { success: true, topics: [], page_info: EMPTY_PAGE_INFO }

      const { results, page_info } = await getTopicIds({ ...searchOptions, omitLimit: false })

      return {
        success: true,
        topics: results.map(result => ({
          id: result.id,
          name: result.name,
          slug: result.slug,
        })),
        page_info,
      }
    },
}

export default tool
