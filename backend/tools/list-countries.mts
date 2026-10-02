import { getCountries, type Country } from '@services/countries'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

type ToolResult = { success: true; results: Country[] }

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'list_countries',
    type: 'function',
    description:
      'List every country Voucha knows, by name: its numeric id, its two-letter ISO code and its name. The list is fixed reference data with no paging.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'List Countries',
    requiredScopes: { mcp: ['reference-data:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/countries' }],
    outputSchema: successSchema({
      results: { type: 'array', items: componentSchema('Country') },
    }),
  },
  function: (_currentUser: BasicUser) => async (): Promise<ToolResult> => ({
    success: true,
    results: await getCountries(),
  }),
}

export default tool
