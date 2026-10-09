import type { MergedToolSource } from './create-merged-tool.mts'
import { getEmailPreferences } from '@services/users'
import type { BasicUser } from '@services/users/types'
import { EMAIL_PREFERENCES_RESULT_SCHEMA } from './preference-tool-support.mts'
import { requirePrivateToolUser } from './private-user.mts'

type ToolResult = {
  success: true
  email_preferences: Awaited<ReturnType<typeof getEmailPreferences>>
}

const tool: MergedToolSource<Record<string, never>, ToolResult> = {
  schema: {
    description:
      'Get which emails the current user receives and when: setup recommendations, the news and community digests, and community moderation summaries with their cadence, weekdays, time of day and time zone. Email addresses and sign-in settings are not included. Change them with edit_my_preferences (option email).',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
  meta: {
    surfaces: ['internal', 'mcp'],
    title: 'Get My Email Preferences',
    requiredScopes: { mcp: ['preferences:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/email-preferences' }],
    outputSchema: EMAIL_PREFERENCES_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => {
    const user = await requirePrivateToolUser(currentUser)
    return { success: true, email_preferences: await getEmailPreferences(user.id) }
  },
}

export default tool
