import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { createPaginationParser } from '@modules/pagination'
import {
  getHouseholdSpendingCategoriesByUserId,
  createHouseholdSpendingCategory,
  updateHouseholdSpendingCategoryById,
  deleteHouseholdSpendingCategoryById,
} from '@services/individuals-households'
import { assertNotSuspended } from '@services/users'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import type { Money } from '@ts-shared/money'

type SpendingFrequency = 'monthly' | 'annually'

type CreateSpendingCategoryRequest = {
  spending_category_id: ApiUuidContract
  amount: Money
  spending_frequency?: SpendingFrequency
  household_id?: ApiUuidContract
  note?: string
}

type UpdateSpendingCategoryRequest = {
  amount?: Money
  spending_frequency?: SpendingFrequency
  note?: string | null
}

const spendingCategoriesPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/spending-categories
app.route('/api/v1/my/spending-categories').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/spending-categories', spendingCategoriesPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/spending-categories')

  const options = spendingCategoriesPagination.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, spendingCategoriesPagination.queryContract)
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/spending-categories', { query })
  ctx.json(await getHouseholdSpendingCategoriesByUserId(currentUser, currentUser, options))
})

// POST /api/v1/my/spending-categories
app.route('/api/v1/my/spending-categories').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/spending-categories')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as CreateSpendingCategoryRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/spending-categories', { body })

  const spendingCategory = await createHouseholdSpendingCategory(
    currentUser,
    currentUser,
    body.spending_category_id,
    { amount: body.amount, spending_frequency: body.spending_frequency, note: body.note },
    body.household_id,
  )

  ctx.setStatus(201)
  ctx.json({ spending_category: spendingCategory })
})

// PATCH /api/v1/my/spending-categories/:id
app.route('/api/v1/my/spending-categories/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/spending-categories/:id')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as UpdateSpendingCategoryRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/spending-categories/:id', {
    path: ctx.params,
    body,
  })

  const spendingCategory = await updateHouseholdSpendingCategoryById(
    currentUser,
    currentUser,
    ctx.params.id!,
    { amount: body.amount, spending_frequency: body.spending_frequency, note: body.note },
  )

  ctx.json({ spending_category: spendingCategory })
})

// DELETE /api/v1/my/spending-categories/:id
app.route('/api/v1/my/spending-categories/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/spending-categories/:id')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'DELETE:/api/v1/my/spending-categories/:id', { path: ctx.params })

  await deleteHouseholdSpendingCategoryById(currentUser, ctx.params.id!)

  ctx.setStatus(204)
})
