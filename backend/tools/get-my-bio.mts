import { getProfile } from '@services/my/profile'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { foundOrNotFoundSchema } from './read-tool-output-schema.mts'
import { componentSchema } from './route-response-schema.mts'

type ToolResult =
  | { success: true; profile: { id: string; markdown: string } }
  | { success: false; error: 'Profile not found' }

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'get_my_bio',
    type: 'function',
    description:
      "Get the current user's own profile bio: their user id and the bio Markdown, exactly as stored (an empty string when there is none), so it can be edited and sent back with update_my_bio. It is the user's own text and is not sanitized. Profile links are read with get_my_profile_links, and get_my_profile reads the wallet profile instead.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Bio',
    requiredScopes: { mcp: ['profile:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/profile' }],
    outputSchema: foundOrNotFoundSchema({ profile: componentSchema('UserProfile') }),
  },
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => {
    const profile = await getProfile(currentUser.id)
    return profile ? { success: true, profile } : { success: false, error: 'Profile not found' }
  },
}

export default tool
