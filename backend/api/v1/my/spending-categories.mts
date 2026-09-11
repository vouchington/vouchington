import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { requireAuth } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import {
  getHouseholdSpendingCategoriesByUserId,
  createHouseholdSpendingCategory,
  updateHouseholdSpendingCategoryById,
  deleteHouseholdSpendingCategoryById,
} from '@services/individuals-households'
import { assertNotSuspended } from '@services/users'
import { isMoney, type Money } from '@ts-shared/money'

const spendingCategoriesPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/spending-categories
app.route('/api/v1/my/spending-categories').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/spending-categories', spendingCategoriesPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/spending-categories')
  const page = await getHouseholdSpendingCategoriesByUserId(
    currentUser,
    currentUser,
    spendingCategoriesPagination.parse(ctx.query),
  )
  ctx.json(page)
})

// POST /api/v1/my/spending-categories
app.route('/api/v1/my/spending-categories').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/spending-categories')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.spending_category_id === 'string', 400, 'spending_category_id is required')
  ctx.assert(
    isUUID(body.spending_category_id as string),
    422,
    'spending_category_id must be a valid UUID',
  )
  ctx.assert('amount' in body, 400, 'amount is required')
  ctx.assert(isMoney(body.amount), 422, 'amount must be valid money')
  if (body.spending_frequency !== undefined) {
    ctx.assert(
      typeof body.spending_frequency === 'string',
      422,
      'spending_frequency must be a string',
    )
    ctx.assert(
      ['monthly', 'annually'].includes(body.spending_frequency as string),
      422,
      'spending_frequency must be monthly or annually',
    )
  }
  if (body.household_id !== undefined) {
    ctx.assert(typeof body.household_id === 'string', 422, 'household_id must be a string')
    ctx.assert(isUUID(body.household_id as string), 422, 'household_id must be a valid UUID')
  }

  const spendingCategory = await createHouseholdSpendingCategory(
    currentUser,
    currentUser,
    body.spending_category_id as string,
    {
      amount: body.amount as Money,
      spending_frequency:
        typeof body.spending_frequency === 'string'
          ? (body.spending_frequency as 'monthly' | 'annually')
          : undefined,
      note: typeof body.note === 'string' ? body.note : undefined,
    },
    typeof body.household_id === 'string' ? body.household_id : undefined,
  )

  ctx.setStatus(201)
  ctx.json({ spending_category: spendingCategory })
})

// PATCH /api/v1/my/spending-categories/:id
app.route('/api/v1/my/spending-categories/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/spending-categories/:id')
  assertNotSuspended(currentUser)

  const id = ctx.params.id!
  ctx.assert(id, 400, 'id is required')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>

  if ('spending_frequency' in body && body.spending_frequency !== undefined) {
    ctx.assert(
      typeof body.spending_frequency === 'string',
      422,
      'spending_frequency must be a string',
    )
    ctx.assert(
      ['monthly', 'annually'].includes(body.spending_frequency as string),
      422,
      'spending_frequency must be monthly or annually',
    )
  }

  if ('amount' in body) {
    ctx.assert(isMoney(body.amount), 422, 'amount must be valid money')
  }
  if ('note' in body && body.note !== undefined && body.note !== null) {
    ctx.assert(typeof body.note === 'string', 422, 'note must be a string or null')
  }

  const spendingCategory = await updateHouseholdSpendingCategoryById(currentUser, currentUser, id, {
    amount: 'amount' in body ? (body.amount as Money) : undefined,
    spending_frequency:
      'spending_frequency' in body
        ? (body.spending_frequency as 'monthly' | 'annually' | undefined)
        : undefined,
    note: 'note' in body ? (body.note as string | null | undefined) : undefined,
  })

  ctx.json({ spending_category: spendingCategory })
})

// DELETE /api/v1/my/spending-categories/:id
app.route('/api/v1/my/spending-categories/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/spending-categories/:id')
  assertNotSuspended(currentUser)

  const id = ctx.params.id!
  ctx.assert(id, 400, 'id is required')

  await deleteHouseholdSpendingCategoryById(currentUser, id)

  ctx.setStatus(204)
})
