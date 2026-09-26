import {
  createHouseholdSpendingCategory,
  deleteHouseholdSpendingCategoryById,
  updateHouseholdSpendingCategoryById,
} from '@services/individuals-households'
import { createManageEntityTool } from './create-manage-entity-tool.mts'
import { moneySchema } from '@ts-shared/data-points/json-schemas'
import type { Money } from '@ts-shared/money'

export default createManageEntityTool({
  toolName: 'manage_my_spending',
  description: "Manage the current user's spending by category.",
  addProperties: {
    spending_category_id: {
      type: 'string',
      description: 'The topic UUID of the spending category (required for action=add)',
    },
    amount: {
      ...moneySchema,
      description: 'Spending amount in integer minor units paired with its currency',
    },
  },
  updateProperties: {
    amount: {
      ...moneySchema,
      description: 'New spending amount in integer minor units paired with its currency',
    },
    spending_frequency: {
      type: 'string',
      enum: ['monthly', 'annually'],
      description: 'How often the spending occurs',
    },
    note: {
      type: 'string',
      description: 'A note about the spending',
    },
  },
  addFn: (user, args) =>
    createHouseholdSpendingCategory(user, user, args.spending_category_id as string, {
      amount: args.amount as Money,
      spending_frequency: args.spending_frequency as 'monthly' | 'annually' | undefined,
      note: args.note as string | undefined,
    }),
  updateFn: (user, args) =>
    updateHouseholdSpendingCategoryById(user, user, args.id, {
      amount: args.amount as Money | undefined,
      spending_frequency: args.spending_frequency as 'monthly' | 'annually' | undefined,
      note: args.note as string | undefined,
    }),
  removeFn: (user, id) => deleteHouseholdSpendingCategoryById(user, id),
  meta: {
    surfaces: ['internal', 'mcp', 'client'],
    title: 'Manage My Spending',
    plan: 'plus',
    requiredScopes: { mcp: ['spending:read', 'spending:write'] },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    api: [
      { method: 'POST', path: '/api/v1/my/spending-categories' },
      { method: 'PATCH', path: '/api/v1/my/spending-categories/:id' },
      { method: 'DELETE', path: '/api/v1/my/spending-categories/:id' },
    ],
  },
})
