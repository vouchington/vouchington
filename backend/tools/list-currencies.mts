import { listCurrencies } from '@services/currencies'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import type { Currency } from '@ts-shared/money'
import {
  pageInputProperties,
  pageProperties,
  type McpPage,
  type McpPageLimit,
} from './mcp-read-output.mts'
import { findPageOrNull, INVALID_CURSOR_RESULT, type InvalidCursorResult } from './paged-search.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { routePropertySchema, routeResponseSchema } from './route-response-schema.mts'
import { clampToolLimit } from './search-system.mts'

type ToolArgs = {
  limit?: number
  after?: string
}

type ToolResult = McpPage<Currency> | InvalidCursorResult

const API = { method: 'GET', path: '/api/v1/currencies' } as const
// One currency as the REST contract spells it: a union of the supported codes with their exponents.
const { items: CURRENCY_SCHEMA } = routePropertySchema(routeResponseSchema(API), 'results') as {
  items: Record<string, unknown>
}
const CURRENCY_PAGE_LIMIT: McpPageLimit = { min: 1, max: 25, default: 25 }
const { default: defaultLimit, max } = CURRENCY_PAGE_LIMIT

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'list_currencies',
    type: 'function',
    description: `List the currencies Voucha supports, by code: each one's lowercase ISO 4217 code and its minor unit exponent (the number of decimal places, so 2 for usd and 0 for jpy). Returns at most ${max} currencies per page and page_info.end_cursor; pass it as after to get the next page. A malformed cursor returns { success: false, error: "Invalid cursor" }.`,
    parameters: {
      type: 'object',
      properties: pageInputProperties('Currencies', CURRENCY_PAGE_LIMIT),
      required: [],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'List Currencies',
    requiredScopes: { mcp: ['reference-data:read'] },
    annotations: { readOnlyHint: true },
    api: [API],
    outputSchema: foundOrNotFoundSchema(pageProperties(CURRENCY_SCHEMA)),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const page = await findPageOrNull(args.after, () =>
        listCurrencies({ limit: clampToolLimit(args.limit, defaultLimit, max), after: args.after }),
      )
      if (!page) return INVALID_CURSOR_RESULT
      return { success: true, results: page.results, page_info: page.page_info }
    },
}

export default tool
