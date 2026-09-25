import type { Context } from '@jongleberry/api-server'
import { assertNotSuspended } from '@services/users/suspension'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'

// Shared by the passkey and TOTP-authenticator management routes, which rename and delete their
// respective items with an identical preamble and body shape.

export async function handleRenameRoute(
  ctx: Context,
  operation: string,
  renameFn: (userId: string, id: string, name: string) => Promise<void>,
): Promise<void> {
  const currentUser = await requireAuth(ctx, operation)
  assertNotSuspended(currentUser)
  ctx.assert(ctx.params.id, 400, 'id required')

  const body = (await ctx.request.json('100kb')) as { name?: string }
  validateRequestContract(ctx, operation, { body })
  const name = (body.name ?? '').trim()
  ctx.assert(name.length > 0 && name.length <= 100, 422, 'name must be 1–100 characters')

  await renameFn(currentUser.id, ctx.params.id, name)
  ctx.setStatus(204)
}

// Treat a missing or unparseable body as an absent re_auth_token so clients reliably receive
// MFA_REAUTH_REQUIRED rather than a 400 JSON parse error.
export async function parseOptionalReAuthToken(
  ctx: Context,
  operation: string,
): Promise<string | undefined> {
  if (!ctx.request.is('json')) return undefined
  const body = (await ctx.request.json('100kb').catch(() => ({}))) as { re_auth_token?: string }
  validateRequestContract(ctx, operation, { body })
  return body.re_auth_token
}
