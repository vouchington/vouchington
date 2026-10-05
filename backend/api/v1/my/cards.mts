import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { createPaginationParser } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import {
  getIndividualCards,
  createIndividualCard,
  updateIndividualCardById,
  deleteIndividualCardById,
} from '@services/individuals-households'
import type { Money } from '@ts-shared/money'

type CreateCardRequest = { card_topic_id: string }

type UpdateCardRequest = {
  opened_on?: string | null
  closed_on?: string | null
  received_sign_up_bonus_on?: string | null
  credit_limit?: Money | null
  is_authorized_user?: boolean
  authorized_user_of_card_id?: string | null
  note?: string | null
}

const cardsPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/cards
app.route('/api/v1/my/cards').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/cards', cardsPagination)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/cards')

  const options = parseRuntimePagination(cardsPagination, ctx.query)
  const query = prepareQueryForValidation(ctx.query, cardsPagination.queryContract)
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/cards', { query })
  const page = await getIndividualCards(currentUser, currentUser, options)
  ctx.json(page)
})

// POST /api/v1/my/cards
app.route('/api/v1/my/cards').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/cards')

  const body = (await ctx.request.json('10kb')) as CreateCardRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/cards', { body })

  const card = await createIndividualCard(currentUser, currentUser, body.card_topic_id)

  ctx.setStatus(201)
  ctx.json({ card })
})

// PATCH /api/v1/my/cards/:id
app.route('/api/v1/my/cards/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/cards/:id')

  const body = (await ctx.request.json('10kb')) as UpdateCardRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/cards/:id', { path: ctx.params, body })

  const card = await updateIndividualCardById(currentUser, currentUser, ctx.params.id!, {
    opened_on: body.opened_on,
    closed_on: body.closed_on,
    received_sign_up_bonus_on: body.received_sign_up_bonus_on,
    credit_limit: body.credit_limit,
    is_authorized_user: body.is_authorized_user,
    authorized_user_of_card_id: body.authorized_user_of_card_id,
    note: body.note,
  })

  ctx.json({ card })
})

// DELETE /api/v1/my/cards/:id
app.route('/api/v1/my/cards/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/cards/:id')
  validateRequestContract(ctx, 'DELETE:/api/v1/my/cards/:id', { path: ctx.params })

  await deleteIndividualCardById(currentUser, currentUser, ctx.params.id!)

  ctx.setStatus(204)
})
