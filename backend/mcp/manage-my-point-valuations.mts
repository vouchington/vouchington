import {
  createIndividualRewardsProgramPointValuation,
  deleteIndividualRewardsProgramPointValuationById,
  updateIndividualRewardsProgramPointValuationById,
} from '@services/individuals-households'
import { createManageEntityTool } from './create-manage-entity-tool.mts'
import { topicReferenceSchema } from './entity-reference-schema.mts'
import { entityIdOrMissing } from './resolve-entity-reference.mts'
import { moneySchema } from '@ts-shared/data-points/json-schemas'
import { MAX_POINT_VALUE_MICROUNITS, MONEY_SCALE, type ScaledMoney } from '@ts-shared/money'

type AddPointValuationArgs = {
  rewards_program_id: string
  value_per_point: ScaledMoney
  note?: string
}
type UpdatePointValuationArgs = { value_per_point?: ScaledMoney; note?: string | null }

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

export default createManageEntityTool<AddPointValuationArgs, UpdatePointValuationArgs>({
  toolName: 'manage_my_point_valuations',
  description:
    "Manage the current user's rewards program point valuations — how much the user values each rewards program's points.",
  addProperties: {
    rewards_program_id: {
      ...topicReferenceSchema,
      description: 'The rewards program topic (required for action=add)',
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
    },
  },
  addFn: async (user, args) =>
    createIndividualRewardsProgramPointValuation(
      user,
      user,
      await entityIdOrMissing('topic', args.rewards_program_id as string),
      {
        value_per_point: args.value_per_point as ScaledMoney,
        note: args.note as string | undefined,
      },
    ),
  updateFn: (user, args) =>
    updateIndividualRewardsProgramPointValuationById(user, user, args.id, {
      value_per_point: args.value_per_point as ScaledMoney | undefined,
      note: args.note as string | undefined,
    }),
  removeFn: (user, id) => deleteIndividualRewardsProgramPointValuationById(user, user, id),
  entity: 'IndividualRewardsProgramPointValuation',
  meta: {
    audience: 'user',
    title: 'Manage My Point Valuations',
    plan: 'plus',
    requiredScopes: ['point-valuations:read', 'point-valuations:write'],
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [
      { method: 'POST', path: '/api/v1/my/rewards-program-point-valuations' },
      { method: 'PATCH', path: '/api/v1/my/rewards-program-point-valuations/:id' },
      { method: 'DELETE', path: '/api/v1/my/rewards-program-point-valuations/:id' },
    ],
  },
})
