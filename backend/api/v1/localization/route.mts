import type { Context } from '@jongleberry/api-server'
import {
  headerValue,
  isLocalizationClientError,
  localizationGetResult,
} from '@services/localization'

export function localizationRoute(ctx: Context): void {
  try {
    const result = localizationGetResult(
      ctx.query as Record<string, unknown>,
      headerValue(ctx.req.headers['if-none-match']),
    )
    ctx.set('ETag', result.etag)
    ctx.set('Cache-Control', `public, max-age=${result.ttlSeconds}`)
    if (result.status === 304 || result.body === undefined) {
      ctx.setStatus(304)
      return
    }
    ctx.json(JSON.parse(result.body) as Record<string, unknown>)
  } catch (error) {
    if (isLocalizationClientError(error)) ctx.throw(400, error.message)
    throw error
  }
}
