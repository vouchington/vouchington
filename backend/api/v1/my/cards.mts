import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { createPaginationParser } from '@modules/pagination'
import {
  getIndividualCards,
  createIndividualCard,
  updateIndividualCardById,
  deleteIndividualCardById,
} from '@services/individuals-households'
import { isMoney, type Money } from '@ts-shared/money'

const cardsPagination = createPaginationParser({
  cursor: { type: 'simple', paramName: 'after' },
  limit: { default: 25, max: 100 },
})

// GET /api/v1/my/cards
app.route('/api/v1/my/cards').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/cards')

  const options = cardsPagination.parse(ctx.query)
  const page = await getIndividualCards(currentUser, currentUser, options)
  ctx.json(page)
})

// POST /api/v1/my/cards
app.route('/api/v1/my/cards').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/cards')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.card_id === 'string', 400, 'card_id is required')

  const card = await createIndividualCard(currentUser, currentUser, body.card_id as string)

  ctx.setStatus(201)
  ctx.json({ card })
})

// PATCH /api/v1/my/cards/:id
app.route('/api/v1/my/cards/:id').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/cards/:id')

  const cardId = ctx.params.id!
  ctx.assert(cardId, 400, 'id is required')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>

  if ('credit_limit' in body && body.credit_limit !== null && body.credit_limit !== undefined) {
    ctx.assert(isMoney(body.credit_limit), 422, 'credit_limit must be valid money')
  }
  if ('is_authorized_user' in body && body.is_authorized_user !== undefined) {
    ctx.assert(
      typeof body.is_authorized_user === 'boolean',
      422,
      'is_authorized_user must be a boolean',
    )
  }
  if (
    'authorized_user_of_id' in body &&
    body.authorized_user_of_id !== null &&
    body.authorized_user_of_id !== undefined
  ) {
    ctx.assert(
      typeof body.authorized_user_of_id === 'string',
      422,
      'authorized_user_of_id must be a string',
    )
  }
  if ('note' in body && body.note !== undefined && body.note !== null) {
    ctx.assert(typeof body.note === 'string', 422, 'note must be a string or null')
  }
  if ('opened_on' in body && body.opened_on !== null && body.opened_on !== undefined) {
    ctx.assert(typeof body.opened_on === 'string', 422, 'opened_on must be a string')
  }
  if ('closed_on' in body && body.closed_on !== null && body.closed_on !== undefined) {
    ctx.assert(typeof body.closed_on === 'string', 422, 'closed_on must be a string')
  }
  if (
    'received_sign_up_bonus_on' in body &&
    body.received_sign_up_bonus_on !== null &&
    body.received_sign_up_bonus_on !== undefined
  ) {
    ctx.assert(
      typeof body.received_sign_up_bonus_on === 'string',
      422,
      'received_sign_up_bonus_on must be a string',
    )
  }

  const card = await updateIndividualCardById(currentUser, currentUser, cardId, {
    opened_on: 'opened_on' in body ? (body.opened_on as string | null | undefined) : undefined,
    closed_on: 'closed_on' in body ? (body.closed_on as string | null | undefined) : undefined,
    received_sign_up_bonus_on:
      'received_sign_up_bonus_on' in body
        ? (body.received_sign_up_bonus_on as string | null | undefined)
        : undefined,
    credit_limit:
      'credit_limit' in body ? (body.credit_limit as Money | null | undefined) : undefined,
    is_authorized_user:
      'is_authorized_user' in body ? (body.is_authorized_user as boolean | undefined) : undefined,
    authorized_user_of_id:
      'authorized_user_of_id' in body
        ? (body.authorized_user_of_id as string | null | undefined)
        : undefined,
    note: 'note' in body ? (body.note as string | null | undefined) : undefined,
  })

  ctx.json({ card })
})

// DELETE /api/v1/my/cards/:id
app.route('/api/v1/my/cards/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/cards/:id')

  const cardId = ctx.params.id!
  ctx.assert(cardId, 400, 'id is required')

  await deleteIndividualCardById(currentUser, currentUser, cardId)

  ctx.setStatus(204)
})
