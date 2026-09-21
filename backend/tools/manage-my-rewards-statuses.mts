import {
  createIndividualRewardsProgramStatus,
  deleteIndividualRewardsProgramStatusById,
  updateIndividualRewardsProgramStatusById,
} from '@services/individuals-households'
import { createManageEntityTool } from './create-manage-entity-tool.mts'

export default createManageEntityTool<
  { rewards_program_status_id: string },
  { since?: string; until?: string }
>({
  toolName: 'manage_my_rewards_statuses',
  description:
    "Manage the current user's loyalty tier / rewards program statuses (e.g. Gold, Platinum).",
  addProperties: {
    rewards_program_status_id: {
      type: 'string',
      description: 'The topic UUID of the rewards program status to add (required for action=add)',
    },
  },
  updateProperties: {
    since: {
      type: 'string',
      description: 'Date the status started in YYYY-MM-DD format',
    },
    until: {
      type: 'string',
      description: 'Date the status ends in YYYY-MM-DD format',
    },
  },
  addFn: (user, args) =>
    createIndividualRewardsProgramStatus(user, user, args.rewards_program_status_id as string),
  updateFn: (user, args) =>
    updateIndividualRewardsProgramStatusById(user, user, args.id, {
      since: args.since as string | undefined,
      until: args.until as string | undefined,
    }),
  removeFn: (user, id) => deleteIndividualRewardsProgramStatusById(user, user, id),
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    requiredScopes: { mcp: ['rewards-statuses:read', 'rewards-statuses:write'] },
    annotations: { destructiveHint: true },
    api: [
      { method: 'POST', path: '/api/v1/my/rewards-program-statuses' },
      { method: 'PATCH', path: '/api/v1/my/rewards-program-statuses/:id' },
      { method: 'DELETE', path: '/api/v1/my/rewards-program-statuses/:id' },
    ],
  },
})
