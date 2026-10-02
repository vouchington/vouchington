import { getEmailPreferences } from '@services/users'
import type { Tool } from '@services/openai-agents/tool-types'
import type { BasicUser } from '@services/users/types'
import { EMAIL_PREFERENCES_RESULT_SCHEMA } from './preference-tool-support.mts'

type ToolResult = {
  success: true
  email_preferences: Awaited<ReturnType<typeof getEmailPreferences>>
}

const tool: Tool<Record<string, never>, ToolResult> = {
  schema: {
    name: 'get_my_email_preferences',
    type: 'function',
    description:
      'Get which emails the current user receives and when: setup recommendations, the news and community digests, and community moderation summaries with their cadence, weekdays, time of day and time zone. Email addresses and sign-in settings are not included. Change them with update_my_email_preferences.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    strict: null,
  },
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Get My Email Preferences',
    requiredScopes: { mcp: ['preferences:read'] },
    annotations: { readOnlyHint: true },
    api: [{ method: 'GET', path: '/api/v1/my/email-preferences' }],
    outputSchema: EMAIL_PREFERENCES_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (): Promise<ToolResult> => ({
    success: true,
    email_preferences: await getEmailPreferences(currentUser.id),
  }),
}

export default tool
