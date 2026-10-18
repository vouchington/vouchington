import type { MergedToolSource } from './create-merged-tool.mts'
import type { BasicUser } from '@services/users/types'
import { requirePrivateToolUser } from './private-user.mts'
import { pickSettings, SETTINGS_RESULT_SCHEMA } from './preference-tool-support.mts'

type ToolResult = { success: true; settings: ReturnType<typeof pickSettings> }

const tool: MergedToolSource<Record<string, never>, ToolResult> = {
  schema: {
    description:
      "Get the current user's privacy and posting settings, including audience, messaging, locale and Hacker News discussions. Edit them with edit_my_preferences (option general). Financial visibility, consents, federation, email addresses, sign-in settings and username are excluded.",
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  meta: {
    audience: 'user',
    title: 'Get My Preferences',
    requiredScopes: ['preferences:read'],
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
