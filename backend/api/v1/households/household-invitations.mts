import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { apiQuery } from '../../api-query-contract.mts'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  createHouseholdInvitationCommand,
  decideHouseholdInvitationCommand,
  householdInvitationsPaginationParser,
  listHouseholdInvitationsCommand,
  listMyHouseholdInvitationsCommand,
  revokeHouseholdInvitationCommand,
} from '@services/individuals-households/household-invitations/commands'

app
  .route('/api/v1/households/:id/invitations')
  .get(async (ctx: Context) => {
    const route = 'GET:/api/v1/households/:id/invitations'
    apiQuery(route, householdInvitationsPaginationParser)
    const currentUser = await requireAuth(ctx, route)
    ctx.json(
      await listHouseholdInvitationsCommand(currentUser, ctx.params, ctx.query, input =>
        validateRequestContract(ctx, route, input),
      ),
    )
  })
  .post(async (ctx: Context) => {
    const route = 'POST:/api/v1/households/:id/invitations'
    const currentUser = await requireAuth(ctx, route)
    const { invitation, created } = await createHouseholdInvitationCommand(
      currentUser,
      ctx.params,
      async () =>
        (await ctx.request.json('1mb')) as {
          user_id?: string
          username?: string
          relationship?: string
        },
      input => validateRequestContract(ctx, route, input),
    )
    ctx.setStatus(created ? 201 : 200)
    ctx.json({ invitation })
  })

app.route('/api/v1/households/:id/invitations/:invitationId').delete(async (ctx: Context) => {
  const route = 'DELETE:/api/v1/households/:id/invitations/:invitationId'
  const currentUser = await requireAuth(ctx, route)
  await revokeHouseholdInvitationCommand(currentUser, ctx.params, input =>
    validateRequestContract(ctx, route, input),
  )
  ctx.setStatus(204)
})

app.route('/api/v1/my/household-invitations').get(async (ctx: Context) => {
  const route = 'GET:/api/v1/my/household-invitations'
  apiQuery(route, householdInvitationsPaginationParser)
  const currentUser = await requireAuth(ctx, route)
  ctx.json(
    await listMyHouseholdInvitationsCommand(currentUser, ctx.query, input =>
      validateRequestContract(ctx, route, input),
    ),
  )
})

app
  .route('/api/v1/my/household-invitations/:invitationId/acceptance')
  .post(async (ctx: Context) => {
    const route = 'POST:/api/v1/my/household-invitations/:invitationId/acceptance'
    const currentUser = await requireAuth(ctx, route)
    ctx.json(
      await decideHouseholdInvitationCommand(
        currentUser,
        ctx.params,
        'accept',
        async () => (await ctx.request.json('1mb')) as Record<string, never>,
        input => validateRequestContract(ctx, route, input),
      ),
    )
  })

app.route('/api/v1/my/household-invitations/:invitationId/decline').post(async (ctx: Context) => {
  const route = 'POST:/api/v1/my/household-invitations/:invitationId/decline'
  const currentUser = await requireAuth(ctx, route)
  await decideHouseholdInvitationCommand(
    currentUser,
    ctx.params,
    'decline',
    async () => (await ctx.request.json('1mb')) as Record<string, never>,
    input => validateRequestContract(ctx, route, input),
  )
  ctx.setStatus(204)
})
