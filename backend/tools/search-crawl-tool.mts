import type { BasicUser } from '@services/users/types'
import type { Tool, ToolMeta } from './types.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  query: string
  limit?: number
  hostname?: string
}

// Crawled content is public, but hostname exclusion is applied when
// exclude_for_user_id is provided (muted/blocked hostnames filtering).
type SearchFn<TItem> = (args: ToolArgs & { exclude_for_user_id?: string }) => Promise<TItem[]>
export type ToolCrawlSearchResult<TItem> = { success: true; results: TItem[] }

// NOTE: Tools created via this factory are not inspected by the tool-conventions
// current-user policy (which only analyzes ObjectLiteralExpression initializers).
// Convention: the `function` property MUST keep `currentUser: BasicUser` as its first
// parameter and this file is the sole source of truth for that contract.
export function createCrawlSearchTool<TItem>(params: {
  name: string
  description: string
  queryDescription: string
  searchFn: SearchFn<TItem>
  meta?: ToolMeta
}): Tool<ToolArgs, ToolCrawlSearchResult<TItem>> {
  return {
    schema: {
      name: params.name,
      type: 'function',
      description: params.description,
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: params.queryDescription,
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return (default: 5, max: 10)',
          },
          hostname: {
            type: 'string',
            description: 'Filter by hostname (e.g., "example.com")',
          },
        },
        required: ['query'],
      },
      strict: null,
    },
    ...(params.meta ? { meta: params.meta } : {}),
    function: (currentUser: BasicUser) => async (args: ToolArgs) => {
      const limit = clampToolLimit(args.limit, 5, 10)
      const results = await params.searchFn({
        ...args,
        limit,
        exclude_for_user_id: currentUser?.id,
      })
      return { success: true, results } satisfies ToolCrawlSearchResult<TItem>
    },
  }
}
