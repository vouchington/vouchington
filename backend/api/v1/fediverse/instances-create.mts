import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { createInstanceFromHostname } from '@services/fediverse-instances'
import { assertWithinContributionActionLimit } from '@services/contribution-gating/limits'
import { getUserActivePlan } from '@services/memberships'
import { apiRequest } from '../../response-contract.mts'
import { classifyFediverseInstance as classifyInstance } from '@services/fediverse-search/adapters/instance-classification'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

app.route('/api/v1/fediverse/instances').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/fediverse/instances')
  const provenance = getRequestContentProvenance()
  assertNotSuspended(currentUser)

  const rawBody = await parseJsonBody<Record<string, unknown>>(ctx)
  ctx.assert(
    typeof rawBody.hostname === 'string' && rawBody.hostname.length > 0,
    422,
    'hostname must be a non-empty string',
  )
  const requestBody = { hostname: rawBody.hostname }
  const body = apiRequest('POST:/api/v1/fediverse/instances', requestBody)

  // ast-grep-ignore: no-three-sequential-awaits -- route handler validates auth/input before dependent mutation or response work
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await assertWithinContributionActionLimit(currentUser, membershipPlan, 'fediverse_instance')

  const result = await createInstanceFromHostname(
    provenance,
    currentUser,
    body.hostname,
    classifyInstance,
  )

  ctx.setStatus(result.status === 'created' ? 201 : 200)
  ctx.json(result)
})
