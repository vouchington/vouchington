import {
  createIndividualRewardsProgramPointValuation,
  deleteIndividualRewardsProgramPointValuationById,
  getIndividualRewardsProgramPointValuations,
  updateIndividualRewardsProgramPointValuationById,
} from '@services/individuals-households'
import { createManageEntityTool } from './create-manage-entity-tool.mts'
import { moneySchema } from '@ts-shared/data-points/json-schemas'
import { MAX_POINT_VALUE_MICROUNITS, MONEY_SCALE, type ScaledMoney } from '@ts-shared/money'

type AddPointValuationArgs = {
  rewards_program_id: string
  value_per_point: ScaledMoney
  note?: string
}
type UpdatePointValuationArgs = { value_per_point?: ScaledMoney; note?: string | null }
type ListPointValuationsArgs = { after?: string; limit?: number }

const pointValueSchema = {
  ...moneySchema,
  properties: {
    ...moneySchema.properties,
    amount: {
      ...moneySchema.properties.amount,
      maximum: MAX_POINT_VALUE_MICROUNITS,
    },
    scale: { type: 'integer', const: MONEY_SCALE },
  },
  required: ['amount', 'currency', 'scale'],
}

export default createManageEntityTool<
  AddPointValuationArgs,
  UpdatePointValuationArgs,
  ListPointValuationsArgs
>({
  toolName: 'manage_my_point_valuations',
  description:
    "Manage the current user's rewards program point valuations — how much the user values each rewards program's points.",
  addProperties: {
    rewards_program_id: {
      type: 'string',
      description: 'The topic UUID of the rewards program (required for action=add)',
    },
    value_per_point: {
      ...pointValueSchema,
      description: 'Point value in millionths of the major currency unit',
    },
  },
  updateProperties: {
    value_per_point: {
      ...pointValueSchema,
      description: 'New point value in millionths of the major currency unit',
    },
    note: {
      type: 'string',
      description: 'A note about the valuation',
    },
  },
  listProperties: {
    after: { type: 'string', description: 'Opaque cursor from the previous page' },
    limit: { type: 'number', description: 'Number of valuations to return, from 1 to 100' },
  },
  listFn: (user, args) =>
    getIndividualRewardsProgramPointValuations(user, user, {
      after: args.after,
      limit: args.limit,
    }),
  addFn: (user, args) =>
    createIndividualRewardsProgramPointValuation(user, user, args.rewards_program_id as string, {
      value_per_point: args.value_per_point as ScaledMoney,
      note: args.note as string | undefined,
    }),
  updateFn: (user, args) =>
    updateIndividualRewardsProgramPointValuationById(user, user, args.id, {
      value_per_point: args.value_per_point as ScaledMoney | undefined,
      note: args.note as string | undefined,
    }),
  removeFn: (user, id) => deleteIndividualRewardsProgramPointValuationById(user, user, id),
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    requiredScopes: { mcp: ['point-valuations:write'] },
    annotations: { destructiveHint: true },
    api: [
      { method: 'GET', path: '/api/v1/my/rewards-program-point-valuations' },
      { method: 'POST', path: '/api/v1/my/rewards-program-point-valuations' },
      { method: 'PATCH', path: '/api/v1/my/rewards-program-point-valuations/:id' },
      { method: 'DELETE', path: '/api/v1/my/rewards-program-point-valuations/:id' },
    ],
  },
})
