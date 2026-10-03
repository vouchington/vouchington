import assert from 'http-assert'
import { getProfile } from '@services/my/profile'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'
import { successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

type ToolResult = { success: true; profile: { id: string; markdown: string } }

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
    outputSchema: successSchema({ profile: componentSchema('UserProfile') }),
  },
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => {
    const user = await requirePrivateToolUser(currentUser)
    const profile = await getProfile(user.id)
    // The account was found a moment ago, so a missing profile means it was deleted since.
    assert(profile, 401, 'Tool current user not found')
    return { success: true, profile }
  },
}

export default tool
