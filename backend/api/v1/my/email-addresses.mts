import { withReauthenticatedAccountChange } from '@services/mfa/account-change'
import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { assertNotSuspended } from '@services/users/suspension'
import {
  listEmailAddressesPage,
  setPrimaryEmailAddress,
  removeEmailAddress,
} from '@services/my/email-addresses'
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
} from '@services/my/email-address-verification'
import { enqueueSendEmailVerificationToken } from '@queues/emails/enqueues'
import { awaitReportedEnqueueAdmission } from '@data-stores/valkey-glide-mq'
import { parseJsonBody, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { createPaginationParser, decodeScopedTierCursor, encodeCursor } from '@modules/pagination'
import { isUUID } from '@modules/utils'
import { apiQuery } from '../../api-query-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import createHttpError from 'http-errors'

type AddEmailAddressRequest = { email_address: string; re_auth_token?: string }
type VerifyEmailAddressRequest = { token: string; re_auth_token?: string }
type SetPrimaryEmailAddressRequest = { is_primary: true; re_auth_token?: string }

const emailAddressesParser = createPaginationParser({
  cursor: { type: 'tier' },
  limit: { min: 1, max: 100, default: 25 },
})

const EMAIL_ADDRESS_PAGE_LIMIT = 25

async function emailAddressPage(userId: string, limit: number, after?: string) {
  const scope = `email-addresses:${userId}:primary-desc-id-asc`
  const cursor = after ? decodeScopedTierCursor(after, scope, 'Invalid cursor format') : undefined
  if (cursor && ((cursor.tier !== 0 && cursor.tier !== 1) || !isUUID(cursor.id))) {
    throw createHttpError(400, 'Invalid cursor format')
  }
  const { results, hasNextPage } = await listEmailAddressesPage(userId, { limit, after: cursor })
  const cursorFor = (email: (typeof results)[number]) =>
    encodeCursor({ tier: email.is_primary ? 1 : 0, id: email.id, scope })
  return {
    results: results.map(({ id: _id, ...email }) => email),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? cursorFor(results[0]) : null,
      end_cursor: hasNextPage && results.at(-1) ? cursorFor(results.at(-1)!) : null,
    },
  }
}

// GET /api/v1/my/email-addresses
app.route('/api/v1/my/email-addresses').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/email-addresses', emailAddressesParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/email-addresses')

  const options = parseRuntimePagination(emailAddressesParser, ctx.query)
  const query = prepareQueryForValidation(ctx.query, emailAddressesParser.queryContract)
  if (ctx.query.limit !== undefined) query.limit = options.limit
  validateRequestContract(ctx, 'GET:/api/v1/my/email-addresses', { query })
  ctx.json(await emailAddressPage(currentUser.id, options.limit, options.after))
})

// POST /api/v1/my/email-addresses — request to add email (sends verification code)
app.route('/api/v1/my/email-addresses').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/email-addresses')
  assertNotSuspended(currentUser)

  const body = (await parseJsonBody(ctx, '10kb')) as AddEmailAddressRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/email-addresses', { body })

  const { token, normalizedEmail } = await withReauthenticatedAccountChange(
    currentUser.id,
    await ctx.getSessionTokenData(),
    body.re_auth_token,
    query => createEmailVerificationToken(currentUser.id, body.email_address, { query }),
  )

  await awaitReportedEnqueueAdmission(() =>
    enqueueSendEmailVerificationToken(
      { emailAddress: normalizedEmail },
      { token, uiLocale: currentUser.ui_locale ?? null },
    ),
  )
  ctx.json({ email_address: normalizedEmail })
})

// POST /api/v1/my/email-addresses/:email/verifications — confirm verification code
app.route('/api/v1/my/email-addresses/:email/verifications').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/email-addresses/:email/verifications')
  assertNotSuspended(currentUser)

  const body = (await parseJsonBody(ctx, '10kb')) as VerifyEmailAddressRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/email-addresses/:email/verifications', {
    path: ctx.params,
    body,
  })

  await withReauthenticatedAccountChange(
    currentUser.id,
    await ctx.getSessionTokenData(),
    body.re_auth_token,
    query => verifyEmailVerificationToken(currentUser.id, ctx.params.email!, body.token, { query }),
  )

  ctx.json(await emailAddressPage(currentUser.id, EMAIL_ADDRESS_PAGE_LIMIT))
})

// PATCH /api/v1/my/email-addresses/:email — set as primary
app.route('/api/v1/my/email-addresses/:email').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/email-addresses/:email')
  assertNotSuspended(currentUser)

  const body = (await parseJsonBody(ctx, '10kb')) as SetPrimaryEmailAddressRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/my/email-addresses/:email', {
    path: ctx.params,
    body,
  })

  await withReauthenticatedAccountChange(
    currentUser.id,
    await ctx.getSessionTokenData(),
    body.re_auth_token,
    query => setPrimaryEmailAddress(currentUser.id, ctx.params.email!, { query }),
  )

  ctx.json(await emailAddressPage(currentUser.id, EMAIL_ADDRESS_PAGE_LIMIT))
})

// DELETE /api/v1/my/email-addresses/:email — remove email
app.route('/api/v1/my/email-addresses/:email').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/email-addresses/:email')
  assertNotSuspended(currentUser)
  const body = ctx.request.is('json')
    ? ((await ctx.request.json('10kb')) as { re_auth_token?: string })
    : {}
  validateRequestContract(ctx, 'DELETE:/api/v1/my/email-addresses/:email', {
    path: ctx.params,
    body,
  })
  await withReauthenticatedAccountChange(
    currentUser.id,
    await ctx.getSessionTokenData(),
    body.re_auth_token,
    query => removeEmailAddress(currentUser.id, ctx.params.email!, { query }),
  )

  ctx.setStatus(204)
})
