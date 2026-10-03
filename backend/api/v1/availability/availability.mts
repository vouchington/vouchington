import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { apiQuery } from '../../response-contract.mts'
import { defineQueryContract, queryEnum, queryString } from '@modules/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import { isAdminUser } from '@services/users'
import { checkAvailability, type AvailabilityKind } from '@services/availability'

const VALID_KINDS = [
  'topic-slug',
  'topic-name',
  'community-slug',
  'post-slug',
  'username',
] as const satisfies readonly AvailabilityKind[]
const availabilityQuery = defineQueryContract({
  kind: queryEnum(VALID_KINDS),
  value: queryString(),
})

app.route('/api/v1/availability').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/availability', availabilityQuery)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/availability')

  const kind = ctx.query.kind
  const value = ctx.query.value

  ctx.assert(kind && typeof kind === 'string', 400, 'kind is required')
  ctx.assert(VALID_KINDS.includes(kind as AvailabilityKind), 400, 'Invalid kind')
  ctx.assert(
    value && typeof value === 'string' && value.trim().length > 0,
    400,
    'value is required',
  )
  validateRequestContract(ctx, 'GET:/api/v1/availability', {
    query: prepareQueryForValidation(ctx.query, availabilityQuery.queryContract),
  })

  // Post slugs are admin-only: restrict to prevent leaking private/pending post existence via slug.
  if (kind === 'post-slug') {
    ctx.assert(isAdminUser(currentUser), 403, 'Only admins can check post slug availability')
  }

  const result = await checkAvailability(kind as AvailabilityKind, value)
  ctx.json(result)
})
