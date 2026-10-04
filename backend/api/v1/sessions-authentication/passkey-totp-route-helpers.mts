import type { Context } from '@jongleberry/api-server'
import { buildPageInfo, decodeScopedUuidCursor, type QueryContract } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users/suspension'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'

// Shared by the passkey and TOTP-authenticator management routes (list, rename, and delete): the
// auth/id preamble, body validation, and the service call. Each route makes its own
// `apiQuery(...)`/`ctx.json(...)` call (list), `apiRequestContract<Key, T>(key)` marker call
// (rename/delete), and `ctx.setStatus(204)` call (rename/delete) directly in its own handler.
// A `ctx.json(...)` or streamed JSON call inside a function invoked from more than one route is
// rejected by `response-contract-ambiguous-attribution.mts` instead of being omitted from the
// generated contract. Request-body reads in a shared helper are still not attributed to one
// route, so those markers stay at each caller too. Neither `renameMfaFactor` nor
// `deleteMfaFactor` sets the response status itself; each caller does.

async function requireAuthAndItemId(
  ctx: Context,
  operation: string,
): Promise<{ currentUser: PrivateUser; id: string }> {
  const currentUser = await requireAuth(ctx, operation)
  assertNotSuspended(currentUser)
  ctx.assert(ctx.params.id, 400, 'id required')
  validateRequestContract(ctx, operation, { path: ctx.params })
  return { currentUser, id: ctx.params.id }
}

// Shared by the passkey and TOTP-authenticator rename routes: run the auth/id preamble, read and
// validate the body, and rename. `rename` is the one call whose error semantics (404 when the item
// isn't found) differ only by service, not by route. The caller is responsible for its own
// `apiRequestContract<Key, { name?: string }>(key)` marker call and its own `ctx.setStatus(204)`
// (see this file's header).
export async function renameMfaFactor(
  ctx: Context,
  operation: string,
  rename: (userId: string, itemId: string, name: string) => Promise<void>,
): Promise<void> {
  const { currentUser, id } = await requireAuthAndItemId(ctx, operation)
  const body = (await ctx.request.json('100kb')) as { name?: string }
  validateRequestContract(ctx, operation, { body })
  const name = (body.name ?? '').trim()
  ctx.assert(name.length > 0 && name.length <= 100, 422, 'name must be 1–100 characters')
  await rename(currentUser.id, id, name)
}

// Shared by the passkey and TOTP-authenticator delete routes: run the auth/id preamble, read the
// optional re-auth-token body (skipped entirely for a non-JSON request; a missing or unparseable
// body reaches here as `undefined`/`{}` so clients reliably receive MFA_REAUTH_REQUIRED rather than
// a 400 JSON parse error), validate it, and delete. The caller is responsible for its own
// `apiRequestContract<Key, { re_auth_token?: string }>(key)` marker call and its own
// `ctx.setStatus(204)`.
export async function deleteMfaFactor(
  ctx: Context,
  operation: string,
  deleteFactor: (userId: string, itemId: string, reAuthToken: string | undefined) => Promise<void>,
): Promise<void> {
  const { currentUser, id } = await requireAuthAndItemId(ctx, operation)
  const body = ctx.request.is('json')
    ? ((await ctx.request.json('100kb').catch(() => ({}))) as { re_auth_token?: string })
    : undefined
  validateRequestContract(ctx, operation, { body: body === undefined ? {} : body })
  const reAuthToken = body === undefined ? undefined : body.re_auth_token
  await deleteFactor(currentUser.id, id, reAuthToken)
}

// Shared by the passkey and TOTP-authenticator list routes, which page through a user's own items
// with an identical scoped-uuid-cursor shape. The route itself makes its own `apiQuery(...)` call
// and passes the result of this function to its own `ctx.json(...)` call (see this file's header).
// After authentication the parser runs first and keeps its 400 for a bad limit or cursor and its
// limit clamping; the generated query contract then validates the values it settled on, before the
// cursor decode and the service read.
export async function listMfaFactors<T extends { id: string }>(
  ctx: Context,
  operation: string,
  parser: {
    parse: (query: Record<string, unknown>) => { limit: number; after?: string }
    queryContract: QueryContract
  },
  scopePrefix: string,
  fetchFn: (
    userId: string,
    opts: { limit: number; after?: { id: string } },
  ) => Promise<{ results: T[]; hasNextPage: boolean }>,
): Promise<{ results: T[]; page_info: PageInfo }> {
  const currentUser = await requireAuth(ctx, operation)
  const { limit, after } = parser.parse(ctx.query)
  const query = prepareQueryForValidation(ctx.query, parser.queryContract)
  if (ctx.query.limit !== undefined) query.limit = limit
  validateRequestContract(ctx, operation, { query })
  const scope = `${scopePrefix}:${currentUser.id}:created-at-asc-id-asc`
  const afterId = after
    ? decodeScopedUuidCursor(after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await fetchFn(currentUser.id, {
    limit,
    after: afterId ? { id: afterId } : undefined,
  })
  return {
    results,
    page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
  }
}
