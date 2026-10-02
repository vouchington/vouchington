import {
  resolveModerationAppealAccept,
  resolveModerationAppealReduce,
  dismissModerationAppeal,
} from '@services/moderation-appeals'
import { createAdminTool, adminInput, UUID_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

export const resolveModerationAppealTool = createAdminTool<{
  id: string
  action: 'accept' | 'reduce' | 'deny'
}>({
  name: 'resolve_moderation_appeal',
  description:
    'Resolve a delivered appeal. Agent decisions are audited without creating training feedback.',
  scope: 'moderation:approve',
  api: { method: 'POST', path: '/api/v1/appeals/:id/resolution' },
  parameters: adminInput(
    { id: UUID_INPUT, action: { type: 'string', enum: ['accept', 'reduce', 'deny'] } },
    ['id', 'action'],
  ),
  outputSchema: adminRouteOutputSchema(
    { method: 'POST', path: '/api/v1/appeals/:id/resolution' },
    'staff',
  ),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  run: async (user, { id, action }) => ({
    appeal: await (action === 'accept'
      ? resolveModerationAppealAccept(user.id, id, 'agent')
      : action === 'reduce'
        ? resolveModerationAppealReduce(user.id, id, 'agent')
        : dismissModerationAppeal(user.id, id, 'agent')),
  }),
})
