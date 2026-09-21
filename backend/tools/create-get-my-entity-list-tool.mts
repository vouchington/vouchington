import type { BasicUser, PrivateUser } from '@services/users/types'
import type { Tool, ToolMeta } from './types.mts'
import { requirePrivateToolUser } from './private-user.mts'

type GetMyEntityListToolConfig<TArgs extends Record<string, unknown>> = {
  toolName: string
  description: string
  properties: Record<string, unknown>
  listFn: (user: PrivateUser, args: TArgs) => Promise<unknown>
  meta?: ToolMeta
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
    ...(config.meta ? { meta: config.meta } : {}),
    function:
      (currentUser: BasicUser) =>
      async (args: TArgs): Promise<GetMyEntityListToolResult> => {
        const user = await requirePrivateToolUser(currentUser)
        return { success: true, result: await config.listFn(user, args) }
      },
  }
}
