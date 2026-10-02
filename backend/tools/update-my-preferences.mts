import { updateUser } from '@services/users'
import type { BasicUser } from '@services/users/types'
import {
  SETTING_FIELDS,
  SETTINGS_PARAMETERS,
  SETTINGS_RESULT_SCHEMA,
  type SettingsToolArgs,
} from './preference-tool-support.mts'
import { requireActiveToolUser, requirePrivateToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type UpdateMyPreferencesResult = {
  success: true
  settings: Record<(typeof SETTING_FIELDS)[number], unknown>
}

const tool: Tool<SettingsToolArgs, UpdateMyPreferencesResult> = {
  schema: {
    name: 'update_my_preferences',
    type: 'function',
    description:
      "Change the current user's privacy and posting settings: who can see their follows, followers, likes and community memberships, who can message them, the default audience and privacy of new posts, country, interface locale and Hacker News discussions. Only the fields sent change, and every current setting is returned. Financial-data visibility, consents, federation and the username cannot be changed here.",
    parameters: SETTINGS_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Update My Preferences',
    plan: 'plus',
    requiredScopes: { mcp: ['preferences:read', 'preferences:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/users/:idOrSlug' }],
    outputSchema: SETTINGS_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: SettingsToolArgs) => {
    const user = await requireActiveToolUser(currentUser)
    // The same command, with the same authorization policy, as PATCH /api/v1/users/:idOrSlug.
    await updateUser(user, user.id, args)
    const updated: Record<string, unknown> = { ...(await requirePrivateToolUser(currentUser)) }
    return {
      success: true,
      settings: Object.fromEntries(
        SETTING_FIELDS.map(field => [field, updated[field] ?? null]),
      ) as UpdateMyPreferencesResult['settings'],
    }
  },
}

export default tool
