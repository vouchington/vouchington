import { getPublicUserByIdOrSlug } from '@services/users'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { toMcpUser, mcpUserSchema, USER_NOT_FOUND, type McpUser } from './mcp-user-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  user_id: string
}

type ToolResult = { success: true; user: McpUser } | typeof USER_NOT_FOUND

const tool: Tool<ToolArgs, ToolResult> = {
  schema: {
    name: 'get_user',
    type: 'function',
    description:
      'Get one user\'s public profile by UUID or username: username, bio, `account_type` (`official`, `system` or `ai_agent` for a platform account, `null` for a member) and, only when the user shows their verified badge, the verified name. It is the signed-out profile for every caller, your own included: no email, phone, roles, linked accounts or private settings, ever. A deleted or unknown user returns { success: false, error: "User not found" }. An email address or phone number is not a valid identifier.',
    parameters: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'User UUID or username' },
      },
      required: ['user_id'],
    },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get User',
    requiredScopes: { mcp: ['users:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/users/:idOrSlug' }],
    outputSchema: foundOrNotFoundSchema({ user: mcpUserSchema() }),
  },
  function:
    (_currentUser: BasicUser) =>
    async (args: ToolArgs): Promise<ToolResult> => {
      const user = await getPublicUserByIdOrSlug(args.user_id)
      if (!user) return USER_NOT_FOUND
      return { success: true, user: await toMcpUser(user) }
    },
}

export default tool
