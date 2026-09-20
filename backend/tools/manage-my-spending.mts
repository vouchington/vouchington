import {
  createHouseholdSpendingCategory,
  deleteHouseholdSpendingCategoryById,
  getHouseholdSpendingCategoriesByUserId,
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
  listProperties: {
    after: { type: 'string', description: 'Opaque cursor from the prior list page' },
    limit: { type: 'number', minimum: 1, maximum: 100, description: 'Entries per list page' },
  },
  listFn: (user, args) => {
    const pagination = args as { after?: string; limit?: number }
    return getHouseholdSpendingCategoriesByUserId(user, user, {
      after: pagination.after,
      limit: pagination.limit,
    })
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
    requiredScopes: { mcp: ['spending:write'] },
    annotations: { destructiveHint: true },
    api: [
      { method: 'GET', path: '/api/v1/my/spending-categories' },
      { method: 'POST', path: '/api/v1/my/spending-categories' },
      { method: 'PATCH', path: '/api/v1/my/spending-categories/:id' },
      { method: 'DELETE', path: '/api/v1/my/spending-categories/:id' },
    ],
  },
})
