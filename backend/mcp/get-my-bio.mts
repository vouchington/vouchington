import type { MergedToolSource } from './create-merged-tool.mts'
import assert from 'http-assert'
import { getProfile } from '@services/my/profile'
import type { BasicUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'
import { successSchema } from './output-schema-shapes.mts'
import { componentSchema } from './route-response-schema.mts'

type ToolResult = { success: true; profile: { id: string; markdown: string } }

const tool: MergedToolSource<Record<string, never>, ToolResult> = {
  schema: {
    description:
      "Get the current user's own profile bio: their user id and the bio Markdown, exactly as stored (an empty string when there is none), so it can be edited and sent back with edit_my_profile (option bio). It is the user's own text and is not sanitized. Profile links are read with read_my_profile (option links), and read_my_profile (option overview) reads the wallet profile instead.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
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
