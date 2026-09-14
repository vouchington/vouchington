import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { createMicrosoftStoreServiceTickets } from '@services/memberships/microsoft'
import { assertNotSuspended } from '@services/users'
import { requireAuth } from '../../response-helpers.mts'

app.route('/api/v1/memberships/microsoft-store/service-tickets').post(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'POST:/api/v1/memberships/microsoft-store/service-tickets',
  )
  assertNotSuspended(currentUser)
  ctx.json({
    service_tickets: await createMicrosoftStoreServiceTickets({ userId: currentUser.id }),
  })
})
