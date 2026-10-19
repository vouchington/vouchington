import type { MergedToolSource } from './create-merged-tool.mts'
import { getPublicUserByIdOrSlug } from '@services/users'
import { userReferenceSchema } from './entity-reference-schema.mts'
import type { BasicUser } from '@services/users/types'
import { toMcpUser, mcpUserSchema, USER_NOT_FOUND, type McpUser } from './mcp-user-output.mts'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'

type ToolArgs = {
  user_id: string
}

type ToolResult = { success: true; user: McpUser } | typeof USER_NOT_FOUND

const tool: MergedToolSource<ToolArgs, ToolResult> = {
  schema: {
    description:
      "Get a user's signed-out public profile by UUID or username. account_type is always included: official, system or ai_agent for platform accounts, null for members. Verified name appears only when its badge is shown. The same public view applies to the caller's own profile; private fields never appear. Deleted or unknown users return User not found. Email and phone are invalid identifiers.",
    parameters: {
      type: 'object',
      properties: {
        user_id: userReferenceSchema,
      },
      required: ['user_id'],
    },
  },
  meta: {
    audience: 'user',
    title: 'Get User',
    requiredScopes: ['users:read'],
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
