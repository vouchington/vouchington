import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { isAdminUser } from '@services/users'
import { checkAvailability, type AvailabilityKind } from '@services/availability'

const VALID_KINDS: AvailabilityKind[] = [
  'topic-slug',
  'topic-name',
  'community-slug',
  'post-slug',
  'username',
]

app.route('/api/v1/availability').get(async (ctx: Context) => {
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

  // Post slugs are admin-only: restrict to prevent leaking private/pending post existence via slug.
  if (kind === 'post-slug') {
    ctx.assert(isAdminUser(currentUser), 403, 'Only admins can check post slug availability')
  }

  const result = await checkAvailability(kind as AvailabilityKind, value)
  ctx.json(result)
})
