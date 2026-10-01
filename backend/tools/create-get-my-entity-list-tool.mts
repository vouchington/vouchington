import type { BasicUser, PrivateUser } from '@services/users/types'
import type { Tool, ToolMeta } from './types.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { routeResponseSchema, successResultSchema } from './route-response-schema.mts'

type GetMyEntityListToolConfig<TArgs extends Record<string, unknown>> = {
  toolName: string
  description: string
  properties: Record<string, unknown>
  listFn: (user: PrivateUser, args: TArgs) => Promise<unknown>
  // The output schema is derived from `meta.api`, the one REST twin whose body `listFn` returns.
  meta?: Omit<ToolMeta, 'outputSchema'>
}

type GetMyEntityListToolResult = { success: true; result: unknown }

export function createGetMyEntityListTool<TArgs extends Record<string, unknown>>(
  config: GetMyEntityListToolConfig<TArgs>,
): Tool<TArgs, GetMyEntityListToolResult> {
  return {
    schema: {
      name: config.toolName,
      type: 'function',
      description: config.description,
      parameters: {
        type: 'object',
        properties: config.properties,
      },
      strict: null,
    },
    ...(config.meta
      ? { meta: { ...config.meta, outputSchema: deriveOutputSchema(config.toolName, config.meta) } }
      : {}),
    function:
      (currentUser: BasicUser) =>
      async (args: TArgs): Promise<GetMyEntityListToolResult> => {
        const user = await requirePrivateToolUser(currentUser)
        return { success: true, result: await config.listFn(user, args) }
      },
  }
}

// The envelope above and its schema live side by side, so they change together.
function deriveOutputSchema(toolName: string, meta: Omit<ToolMeta, 'outputSchema'>) {
  const [endpoint, ...others] = meta.api ?? []
  if (!endpoint || others.length > 0) {
    throw new Error(`${toolName} must name exactly one REST endpoint to derive its output schema`)
  }
  return successResultSchema(routeResponseSchema(endpoint))
}
