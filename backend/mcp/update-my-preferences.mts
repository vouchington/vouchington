import type { MergedToolSource } from './create-merged-tool.mts'
import { updateUser } from '@services/users'
import type { BasicUser } from '@services/users/types'
import {
  pickSettings,
  SETTINGS_PARAMETERS,
  SETTINGS_RESULT_SCHEMA,
  type SettingsToolArgs,
} from './preference-tool-support.mts'
import { requireActiveToolUser, requirePrivateToolUser } from './private-user.mts'

type UpdateMyPreferencesResult = { success: true; settings: ReturnType<typeof pickSettings> }

const tool: MergedToolSource<SettingsToolArgs, UpdateMyPreferencesResult> = {
  schema: {
    description:
      "Change the current user's privacy and posting settings, including audience, messaging, locale and Hacker News discussions. Only supplied fields change. Financial visibility, consents, federation and username cannot be changed here.",
    parameters: SETTINGS_PARAMETERS,
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
    return { success: true, settings: pickSettings(await requirePrivateToolUser(currentUser)) }
  },
}

export default tool
