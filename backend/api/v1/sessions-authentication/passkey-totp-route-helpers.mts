import type { Context } from '@jongleberry/api-server'
import { buildPageInfo, decodeScopedUuidCursor } from '@modules/pagination'
import type { PageInfo } from '@voucha/types/pagination'
import type { PrivateUser } from '@services/users/types'
import { assertNotSuspended } from '@services/users/suspension'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'

// Shared by the passkey and TOTP-authenticator management routes (rename and delete). Each of
// those 4 routes reads and casts its own request body inline in its own handler, in
// auth-passkeys.mts/auth-totp.mts, instead of through a shared parse helper here: the OpenAPI
// request-contract harvester statically attributes a `ctx.request.json(...) as T` cast to exactly
// one route, and a cast inside a helper shared by 2+ routes can't be attributed to either one — see
// `enclosingRouteBinding` in backend/test-helpers/api-fixtures/request-contract-route-analysis.mts.
// Each call site has a one-line pointer back to this comment. Everything below this point is safe
// to share regardless of how many routes call it: none of it is discovery-relevant.

// The auth + suspension + id-presence preamble common to all 4 routes above.
export async function requireAuthAndItemId(
  ctx: Context,
  operation: string,
): Promise<{ currentUser: PrivateUser; id: string }> {
  const currentUser = await requireAuth(ctx, operation)
  assertNotSuspended(currentUser)
  ctx.assert(ctx.params.id, 400, 'id required')
  return { currentUser, id: ctx.params.id }
}

// Shared by the passkey and TOTP-authenticator rename routes, once each has already parsed its own
// body inline: validate the body against the request contract and extract the trimmed name.
export function validateRenameName(
  ctx: Context,
  operation: string,
  body: { name?: string },
): string {
  validateRequestContract(ctx, operation, { body })
  const name = (body.name ?? '').trim()
  ctx.assert(name.length > 0 && name.length <= 100, 422, 'name must be 1–100 characters')
  return name
}

// Shared by the passkey and TOTP-authenticator delete routes, once each has already parsed its own
// optional body inline: validate it against the request contract and extract the optional re-auth
// token. A missing or unparseable body reaches here as `undefined`/`{}` so clients reliably receive
// MFA_REAUTH_REQUIRED rather than a 400 JSON parse error.
export function validateReAuthToken(
  ctx: Context,
  operation: string,
  body: { re_auth_token?: string },
): string | undefined {
  validateRequestContract(ctx, operation, { body })
  return body.re_auth_token
}

// Shared by the passkey and TOTP-authenticator list routes, which page through a user's own
// items with an identical scoped-uuid-cursor shape. `apiQuery`, `requireAuth`, the parser's own
// `.parse(ctx.query)` call, and the final `ctx.json(...)` all stay at each call site: auth must
// run before parsing, the route-contract registry needs a literal operation key, and the
// OpenAPI response-contract analyzer statically attributes a `ctx.json(...)` call to exactly one
// route — a shared helper called from two different routes can't own that call. This covers only
// the identical decode-cursor, fetch, and page-info-building steps in between.
export async function fetchScopedIdPage<T extends { id: string }>(
  scopePrefix: string,
  userId: string,
  options: { limit: number; after?: string },
  fetchFn: (
    userId: string,
    opts: { limit: number; after?: { id: string } },
  ) => Promise<{ results: T[]; hasNextPage: boolean }>,
): Promise<{ results: T[]; page_info: PageInfo }> {
  const scope = `${scopePrefix}:${userId}:created-at-asc-id-asc`
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await fetchFn(userId, {
    limit: options.limit,
    after: afterId ? { id: afterId } : undefined,
  })
  return {
    results,
    page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
  }
}
