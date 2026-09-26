import type { Context } from '@jongleberry/api-server'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users/suspension'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'

// Shared by the passkey and TOTP-authenticator management routes (list, rename, and delete): the
// auth/id preamble, body validation, and the service call. Each route makes its own
// `apiQuery(...)`/`ctx.json(...)` call (list), `apiRequestContract<Key, T>(key)` marker call
// (rename/delete), and `ctx.setStatus(204)` call (rename/delete) directly in its own handler —
// the same convention `apiRequestContract`'s own docstring describes ("handlers whose body is
// parsed by a shared factory") and that `logout.mts`/`entity-relation-votes.mts` already use for
// requests, extended here to the response side too — so the OpenAPI static analyzers
// (`backend/test-helpers/api-fixtures/*-route-analysis.mts`) can attribute each route's request
// and response contract without needing the actual `ctx.request.json(...)`/`ctx.json(...)`/
// `ctx.setStatus(...)` call itself to sit inside the route file: a call lexically inside a
// function invoked from more than one route resolves to no route at all (an ambiguous binding),
// so the implicit harvesters that would otherwise try to attribute it silently skip it — the
// route's own marker/response call is the sole source of truth instead. Concretely: neither
// `renameMfaFactor` nor `deleteMfaFactor` below sets the response status itself; each caller does.

async function requireAuthAndItemId(
  ctx: Context,
  operation: string,
): Promise<{ currentUser: PrivateUser; id: string }> {
  const currentUser = await requireAuth(ctx, operation)
  assertNotSuspended(currentUser)
  ctx.assert(ctx.params.id, 400, 'id required')
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
  const reAuthToken = body === undefined ? undefined : validateReAuthToken(ctx, operation, body)
  await deleteFactor(currentUser.id, id, reAuthToken)
}

// Shared by `deleteMfaFactor`'s two call sites: validate the already-read optional body against
// the request contract and extract the optional re-auth token.
function validateReAuthToken(
  ctx: Context,
  operation: string,
  body: { re_auth_token?: string },
): string | undefined {
  validateRequestContract(ctx, operation, { body })
  return body.re_auth_token
}

// Shared by the passkey and TOTP-authenticator list routes, which page through a user's own items
// with an identical scoped-uuid-cursor shape. The route itself makes its own `apiQuery(...)` call
// and passes the result of this function to its own `ctx.json(...)` call (see this file's header).
export async function listMfaFactors<T extends { id: string }>(
  ctx: Context,
  operation: string,
  parser: { parse: (query: Record<string, unknown>) => { limit: number; after?: string } },
  scopePrefix: string,
  fetchFn: (
    userId: string,
    opts: { limit: number; after?: { id: string } },
  ) => Promise<{ results: T[]; hasNextPage: boolean }>,
): Promise<{ results: T[]; page_info: PageInfo }> {
  const currentUser = await requireAuth(ctx, operation)
  const { limit, after } = parser.parse(ctx.query)
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
