import { getEmailPreferences, updateEmailPreferences } from '@services/users'
import type { BasicUser } from '@services/users/types'
import {
  EMAIL_PREFERENCES_PARAMETERS,
  EMAIL_PREFERENCES_RESULT_SCHEMA,
  type EmailPreferencesToolArgs,
} from './preference-tool-support.mts'
import { requireActiveToolUser } from './private-user.mts'
import type { Tool } from '@services/openai-agents/tool-types'

type UpdateMyEmailPreferencesResult = {
  success: true
  email_preferences: Awaited<ReturnType<typeof getEmailPreferences>>
}

const tool: Tool<EmailPreferencesToolArgs, UpdateMyEmailPreferencesResult> = {
  schema: {
    name: 'update_my_email_preferences',
    type: 'function',
    description:
      'Change which emails the current user receives and when: setup recommendations, the news and community digests, and community moderation summaries. Only the fields sent change. Email addresses and sign-in settings cannot be changed here.',
    parameters: EMAIL_PREFERENCES_PARAMETERS,
    strict: null,
  },
  meta: {
    surfaces: ['mcp'],
    title: 'Update My Email Preferences',
    plan: 'plus',
    requiredScopes: { mcp: ['preferences:read', 'preferences:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [{ method: 'PATCH', path: '/api/v1/my/email-preferences' }],
    outputSchema: EMAIL_PREFERENCES_RESULT_SCHEMA,
  },
  function: (currentUser: BasicUser) => async (args: EmailPreferencesToolArgs) => {
    const user = await requireActiveToolUser(currentUser)
    return { success: true, email_preferences: await updateEmailPreferences(user.id, args) }
  },
}

export default tool
