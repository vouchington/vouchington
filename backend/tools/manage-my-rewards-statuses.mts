import {
  createIndividualRewardsProgramStatus,
  deleteIndividualRewardsProgramStatusById,
  getIndividualRewardsProgramStatuses,
  updateIndividualRewardsProgramStatusById,
} from '@services/individuals-households'
import { createManageEntityTool } from './create-manage-entity-tool.mts'

export default createManageEntityTool<
  { rewards_program_status_id: string },
  { since?: string; until?: string },
  { after?: string; limit?: number }
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
  listProperties: {
    after: { type: 'string', description: 'Opaque cursor from the previous status page' },
    limit: { type: 'number', description: 'Number of statuses to return, from 1 to 100' },
  },
  listFn: (user, args) =>
    getIndividualRewardsProgramStatuses(user, user, {
      after: args.after as string | undefined,
      limit: args.limit as number | undefined,
    }),
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
    requiredScopes: { mcp: ['rewards-statuses:write'] },
    annotations: { destructiveHint: true },
    api: [
      { method: 'GET', path: '/api/v1/my/rewards-program-statuses' },
      { method: 'POST', path: '/api/v1/my/rewards-program-statuses' },
      { method: 'PATCH', path: '/api/v1/my/rewards-program-statuses/:id' },
      { method: 'DELETE', path: '/api/v1/my/rewards-program-statuses/:id' },
    ],
  },
})
