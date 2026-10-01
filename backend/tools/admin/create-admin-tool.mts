import assert from 'http-assert'
import { isAdminUser, assertNotSuspended } from '@services/users'
import type { PrivateUser } from '@services/users/types'
import { SCOPE_DEFINITIONS, type ApiScope } from '@modules/scopes'
import type {
  Tool,
  ToolAnnotations,
  ToolApiEndpoint,
  ToolOutputSchema,
} from '@services/openai-agents/tool-types'
import { requirePrivateToolUser } from '../private-user.mts'
import { findSchemaViolation } from '../schema-validator.mts'
import { adminOutputSchema, wrapAdminOutput } from './untrusted-output.mts'

type AdminToolConfig<TArgs> = {
  name: string
  description: string
  scope: ApiScope
  api: ToolApiEndpoint
  parameters: Record<string, unknown>
  outputSchema: ToolOutputSchema
  annotations: ToolAnnotations
  run: (currentUser: PrivateUser, args: TArgs) => Promise<unknown>
}

export function createAdminTool<TArgs>(config: AdminToolConfig<TArgs>): Tool<TArgs> {
  const prerequisite = SCOPE_DEFINITIONS[config.scope].requires
  return {
    schema: {
      name: config.name,
      type: 'function',
      description: config.description,
      parameters: config.parameters,
      strict: null,
    },
    roles: { administrator: true, user: false },
    meta: {
      title: config.name[0]!.toUpperCase() + config.name.slice(1).replaceAll('_', ' '),
      surfaces: ['admin_mcp'],
      requiredScopes: {
        admin_mcp: prerequisite ? [prerequisite as ApiScope, config.scope] : [config.scope],
      },
      annotations: config.annotations,
      api: [config.api],
      outputSchema: adminOutputSchema(config.outputSchema) as ToolOutputSchema,
    },
    function: currentUser => async args => {
      const user = await requirePrivateToolUser(currentUser)
      assert(isAdminUser(user), 403, 'Administrator role required')
      if (!config.annotations.readOnlyHint) assertNotSuspended(user)
      const error = findSchemaViolation(config.parameters, args)
      assert(!error, 422, 'Invalid tool arguments')
      return wrapAdminOutput(await config.run(user, args))
    },
  }
}

export const UUID_INPUT = { type: 'string', format: 'uuid' }
export const TEXT_INPUT = { type: 'string', minLength: 1, maxLength: 2000 }
export const PAGE_INPUT = {
  after: { type: 'string' },
  limit: { type: 'integer', minimum: 1, maximum: 100 },
}
export function adminInput(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return { type: 'object', properties, required, additionalProperties: false }
}
