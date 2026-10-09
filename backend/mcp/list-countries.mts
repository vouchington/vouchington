import type { MergedToolSource } from './create-merged-tool.mts'
import { getCountries, type Country } from '@services/countries'
import type { BasicUser } from '@services/users/types'
import { successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

type ToolResult = { success: true; results: Country[] }

const tool: MergedToolSource<Record<string, never>, ToolResult> = {
  schema: {
    description:
      'List every country Voucha knows, by name: its numeric id, its two-letter ISO code and its name. The list is fixed reference data with no paging.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
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
