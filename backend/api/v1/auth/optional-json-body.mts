import type { Context } from '@jongleberry/api-server'

/** Reads a JSON body while preserving the established empty-body mutation contract. */
export async function readOptionalJsonBody(
  ctx: Context,
  limit: string,
): Promise<unknown | undefined> {
  const rawBody = await ctx.request.buffer(limit)
  if (rawBody.length === 0) return undefined
  try {
    return JSON.parse(rawBody.toString('utf8')) as unknown
  } catch {
    ctx.assert(false, 400, 'request body must be valid JSON')
    return undefined
  }
}
