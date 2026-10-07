import { parseCreateUserWarningInput, listIssuedUserWarnings } from '@services/user-warnings'
import { issueUserWarning } from '@services/user-warnings/issue-warning'
import {
  createAdminTool,
  adminInput,
  UUID_INPUT,
  PAGE_INPUT,
  TEXT_INPUT,
} from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

type WarningArgs = {
  userId: string
  reason: string
  publicMessage?: string
  communityId?: string
  reportId?: string
  resolveReport?: boolean
}
export const adminWarningTools = [
  createAdminTool<{ userId: string; after?: string; limit?: number }>({
    name: 'list_user_warnings',
    description: 'List warnings issued to a user.',
    scope: 'moderation:read',
    api: { method: 'GET', path: '/api/v1/admin/warnings' },
    parameters: adminInput({ ...PAGE_INPUT, userId: UUID_INPUT }, ['userId']),
    outputSchema: adminRouteOutputSchema({ method: 'GET', path: '/api/v1/admin/warnings' }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (_user, args) => {
      const { warnings, hasNextPage, startCursor, endCursor } = await listIssuedUserWarnings(args)
      return {
        warnings,
        page_info: { has_next_page: hasNextPage, start_cursor: startCursor, end_cursor: endCursor },
      }
    },
  }),
  createAdminTool<WarningArgs>({
    name: 'issue_user_warning',
    description:
      'Issue a warning after checking any linked report belongs to the target user and community. Agent actions do not create training feedback.',
    scope: 'moderation:write',
    api: { method: 'POST', path: '/api/v1/admin/warnings' },
    parameters: adminInput(
      {
        userId: UUID_INPUT,
        reason: TEXT_INPUT,
        publicMessage: TEXT_INPUT,
        communityId: UUID_INPUT,
        reportId: UUID_INPUT,
        resolveReport: { type: 'boolean' },
      },
      ['userId', 'reason'],
    ),
    outputSchema: adminRouteOutputSchema({ method: 'POST', path: '/api/v1/admin/warnings' }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => ({
      warning: await issueUserWarning(user.id, parseCreateUserWarningInput(args), 'agent'),
    }),
  }),
]
