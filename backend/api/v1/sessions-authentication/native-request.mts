import type { Context } from '@jongleberry/api-server'

/** Browser APIs always attach Origin or Sec-Fetch metadata to these unsafe requests. */
export function assertNativeRequest(ctx: Context): void {
  if (
    ctx.req.headers.origin !== undefined ||
    Object.keys(ctx.req.headers).some(name => name.toLowerCase().startsWith('sec-fetch-'))
  ) {
    ctx.throw(403, 'Browser requests are not allowed')
  }
}
