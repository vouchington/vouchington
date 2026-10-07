import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'
import { pickSettings, SETTINGS_RESULT_SCHEMA } from './preference-tool-support.mts'

type ToolResult = { success: true; settings: ReturnType<typeof pickSettings> }

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'get_my_preferences',
    type: 'function',
    description:
      "Get the current user's own privacy and posting settings: who can see their follows, followers, likes and community memberships, who can message them, the default audience and privacy of new posts, country, interface locale and Hacker News discussions. These are the settings update_my_preferences changes. Financial-data visibility, consents, federation, email addresses, sign-in settings and the username are not included.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get My Preferences',
    requiredScopes: { mcp: ['preferences:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/users/:idOrSlug' }],
    outputSchema: SETTINGS_RESULT_SCHEMA,
  },
  // The private view GET /api/v1/users/:idOrSlug returns to the account's own owner.
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => ({
    success: true,
    settings: pickSettings(await requirePrivateToolUser(currentUser)),
  }),
}

export default tool
