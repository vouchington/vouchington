import type { PrivateUser } from '@services/users/types'
import type { ToolApiEndpoint, ToolOutputSchema } from '@services/openai-agents/tool-types'
import type { MergedToolSource } from './create-merged-tool.mts'
import { requirePrivateToolUser } from './private-user.mts'
import { getDelegatedToolAuthority } from './delegated-authority.mts'
import { routeResponseSchema } from './route-response-schema.mts'
import { successSchema } from '@vouchington/mcp-server/schema'

export const uuid = { type: 'string', format: 'uuid' }
export const pageProperties = {
  after: { type: 'string', description: 'Opaque cursor from this option’s previous page.' },
  limit: { type: 'integer', description: 'Page size; uses the REST default and maximum.' },
}
export type PageArgs = { after?: string; limit?: number }
export type HouseholdArgs = PageArgs & { household_id: string }
export const path = (args: HouseholdArgs) => ({ id: args.household_id })
export const page = (args: PageArgs) => ({
  ...(args.after === undefined ? {} : { after: args.after }),
  ...(args.limit === undefined ? {} : { limit: args.limit }),
})
export const validated = () => {}

export function source<TArgs>(
  description: string,
  api: ToolApiEndpoint,
  properties: Record<string, unknown>,
  required: string[],
  execute: (currentUser: PrivateUser, args: TArgs) => Promise<unknown>,
  write = false,
  outputSchema?: ToolOutputSchema,
): MergedToolSource<TArgs> {
  return {
    schema: {
      description,
      parameters: { type: 'object', properties, required, additionalProperties: false },
    },
    meta: {
      audience: 'user',
      title: write ? 'Manage My Households' : 'Read My Households',
      ...(write ? { plan: 'plus' as const } : {}),
      requiredScopes: write ? ['households:read', 'households:write'] : ['households:read'],
      annotations: write
        ? { readOnlyHint: false, destructiveHint: true, idempotentHint: false }
        : { readOnlyHint: true },
      api: [api],
      outputSchema:
        outputSchema ?? (api.method === 'DELETE' ? successSchema({}) : routeResponseSchema(api)),
    },
    function: currentUser => async (args, invocationContext) => {
      const user = await requirePrivateToolUser(currentUser)
      if (write) getDelegatedToolAuthority(user, invocationContext)
      return execute(user, args)
    },
  }
}
