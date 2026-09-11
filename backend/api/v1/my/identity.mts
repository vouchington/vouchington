import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { updateUsername, updateProfileImageId } from '@services/my/identity'
import { assertNotSuspended } from '@services/users/suspension'
import { isOfficialAccount } from '@services/users/authorization'
import { getUserPrivateByAnyCached } from '@services/entity-fetch'
import {
  listEmailAddressesPage,
  createEmailVerificationToken,
  verifyEmailVerificationToken,
  setPrimaryEmailAddress,
  removeEmailAddress,
} from '@services/my/email-addresses'
import { updateUserFields } from '@services/users/update-fields'
import type { UpdateUserOptions } from '@services/users/types'
import { enqueueSendEmailVerificationToken } from '@queues/emails/enqueues'
import { isUUID } from '@modules/utils'
import { oauthProviders } from '@services/oauth'
import { requireAuth } from '../../response-helpers.mts'
import {
  createPaginationParser,
  decodeScopedTierPreciseNameCursor,
  encodeScopedTierPreciseNameCursor,
} from '@modules/pagination'

const emailAddressesParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 25 },
})
import { apiQuery, apiResponse } from '../../response-contract.mts'
import createHttpError from 'http-errors'

const EMAIL_ADDRESS_PAGE_LIMIT = 25

async function emailAddressPage(userId: string, limit: number, after?: string) {
  const scope = `email-addresses:${userId}:primary-desc-created-asc-email-asc`
  const cursor = after
    ? decodeScopedTierPreciseNameCursor(after, scope, 'Invalid cursor format')
    : undefined
  if (cursor && cursor.tier !== 0 && cursor.tier !== 1) {
    throw createHttpError(400, 'Invalid cursor format')
  }
  const { results, hasNextPage } = await listEmailAddressesPage(userId, { limit, after: cursor })
  const cursorFor = (email: (typeof results)[number]) =>
    encodeScopedTierPreciseNameCursor(
      email.is_primary ? 1 : 0,
      email.cursor_timestamp,
      email.email_address,
      scope,
    )
  return {
    results: results.map(({ cursor_timestamp: _cursorTimestamp, ...email }) => email),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? cursorFor(results[0]) : null,
      end_cursor: hasNextPage && results.at(-1) ? cursorFor(results.at(-1)!) : null,
    },
  }
}

// GET /api/v1/my/identity
app.route('/api/v1/my/identity').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/identity')

  const identity = await getUserPrivateByAnyCached(currentUser.id)
  ctx.assert(identity, 404, 'User not found')

  ctx.json(
    apiResponse('GET:/api/v1/my/identity', {
      identity: { ...identity, is_official_account: isOfficialAccount(identity) },
    }),
  )
})

// PATCH /api/v1/my/identity
app.route('/api/v1/my/identity').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/identity')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>

  if (typeof body.username === 'string') {
    await updateUsername(currentUser.id, body.username)
  }

  if (typeof body.use_display_name_from === 'string') {
    const value = body.use_display_name_from
    const validValues = ['username', ...oauthProviders]
    ctx.assert(
      validValues.includes(value),
      422,
      `use_display_name_from must be one of: ${validValues.join(', ')}`,
    )
    await updateUserFields(currentUser.id, {
      use_display_name_from: value as UpdateUserOptions['use_display_name_from'],
    })
  }

  if ('profile_image_id' in body) {
    const imageId = body.profile_image_id
    ctx.assert(
      imageId === null || typeof imageId === 'string',
      400,
      'profile_image_id must be a string or null',
    )
    if (typeof imageId === 'string') {
      ctx.assert(isUUID(imageId), 400, 'profile_image_id must be a valid UUID')
    }
    await updateProfileImageId(currentUser.id, imageId as string | null)
  }

  const identity = await getUserPrivateByAnyCached(currentUser.id)
  ctx.json({ identity: { ...identity, is_official_account: isOfficialAccount(identity) } })
})

// GET /api/v1/my/email-addresses
app.route('/api/v1/my/email-addresses').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/email-addresses', emailAddressesParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/email-addresses')

  const options = emailAddressesParser.parse(ctx.query)
  ctx.json(await emailAddressPage(currentUser.id, options.limit, options.after))
})

// POST /api/v1/my/email-addresses — request to add email (sends verification code)
app.route('/api/v1/my/email-addresses').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/email-addresses')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.email_address === 'string', 400, 'email_address is required')

  const { token, normalizedEmail } = await createEmailVerificationToken(
    currentUser.id,
    body.email_address as string,
  )

  ctx.json({ email_address: normalizedEmail })
  enqueueSendEmailVerificationToken(
    { emailAddress: normalizedEmail },
    { token, uiLocale: currentUser.ui_locale ?? null },
  )
})

// POST /api/v1/my/email-addresses/:email/verifications — confirm verification code
app.route('/api/v1/my/email-addresses/:email/verifications').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/email-addresses/:email/verifications')
  assertNotSuspended(currentUser)

  const emailAddress = ctx.params.email!
  ctx.assert(emailAddress, 400, 'email is required')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.token === 'string', 400, 'token is required')

  await verifyEmailVerificationToken(currentUser.id, emailAddress, body.token as string)

  ctx.json(await emailAddressPage(currentUser.id, EMAIL_ADDRESS_PAGE_LIMIT))
})

// PATCH /api/v1/my/email-addresses/:email — set as primary
app.route('/api/v1/my/email-addresses/:email').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/email-addresses/:email')
  assertNotSuspended(currentUser)

  const emailAddress = ctx.params.email!
  ctx.assert(emailAddress, 400, 'email is required')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(body.is_primary === true, 400, 'is_primary must be true')

  await setPrimaryEmailAddress(currentUser.id, emailAddress)

  ctx.json(await emailAddressPage(currentUser.id, EMAIL_ADDRESS_PAGE_LIMIT))
})

// DELETE /api/v1/my/email-addresses/:email — remove email
app.route('/api/v1/my/email-addresses/:email').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/email-addresses/:email')
  assertNotSuspended(currentUser)

  const emailAddress = ctx.params.email!
  ctx.assert(emailAddress, 400, 'email is required')

  await removeEmailAddress(currentUser.id, emailAddress)

  ctx.setStatus(204)
})
