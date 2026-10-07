import { suspendUser, unsuspendUser } from '@services/users'
import { adminSetVoteWeight, adminClearVoteWeight } from '@services/vote-weight/admin-set'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'
import { createAdminTool, adminInput, UUID_INPUT, TEXT_INPUT } from './create-admin-tool.mts'
import { adminRouteOutputSchema } from './output-schema.mts'

const successSchema = {
  type: 'object' as const,
  properties: { success: { const: true } },
  required: ['success'],
  additionalProperties: false,
}
export const adminAccountControlTools = [
  createAdminTool<{ userId: string; reason?: string }>({
    name: 'suspend_user',
    description:
      'Suspend an account. Self, staff (administrator or moderator) and platform account targets are refused; a platform account is any account whose account_type is not null (official, system or ai_agent).',
    scope: 'account-enforcement:suspend',
    api: { method: 'PUT', path: '/api/v1/users/:userId/suspension' },
    parameters: adminInput({ userId: UUID_INPUT, reason: TEXT_INPUT }, ['userId']),
    outputSchema: adminRouteOutputSchema({
      method: 'PUT',
      path: '/api/v1/users/:userId/suspension',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, args) => ({
      user: await suspendUser(user, args.userId, 'refuse', args.reason),
    }),
  }),
  createAdminTool<{ userId: string }>({
    name: 'unsuspend_user',
    description: 'Lift an active suspension unless a copyright termination remains in effect.',
    scope: 'account-enforcement:suspend',
    api: { method: 'DELETE', path: '/api/v1/users/:userId/suspension' },
    parameters: adminInput({ userId: UUID_INPUT }, ['userId']),
    outputSchema: adminRouteOutputSchema({
      method: 'DELETE',
      path: '/api/v1/users/:userId/suspension',
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    run: async (user, args) => ({ user: await unsuspendUser(user, args.userId) }),
  }),
  createAdminTool<{ userId: string; weight: number }>({
    name: 'set_user_vote_weight',
    description: 'Set an existing account vote weight between zero and one million.',
    scope: 'account-enforcement:vote-weight',
    api: { method: 'PUT', path: '/api/v1/users/:userId/vote-weight' },
    parameters: adminInput(
      { userId: UUID_INPUT, weight: { type: 'number', minimum: 0, maximum: 1000000 } },
      ['userId', 'weight'],
    ),
    outputSchema: successSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      await adminSetVoteWeight(user.id, args.userId, args.weight)
      return { success: true }
    },
  }),
  createAdminTool<{ userId: string }>({
    name: 'clear_user_vote_weight',
    description: 'Clear an existing account override and recalculate its vote weight.',
    scope: 'account-enforcement:vote-weight',
    api: { method: 'DELETE', path: '/api/v1/users/:userId/vote-weight' },
    parameters: adminInput({ userId: UUID_INPUT }, ['userId']),
    outputSchema: successSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
    run: async (user, args) => {
      await adminClearVoteWeight(user.id, args.userId)
      await enqueueRecalculateUserVoteWeight(args.userId, true)
      return { success: true }
    },
  }),
]
