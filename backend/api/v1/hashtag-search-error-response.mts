import { isHashtagTopicSearchError } from '@services/search-params'
import type { Context } from '@jongleberry/api-server'

export function sendHashtagTopicSearchErrorResponse(ctx: Context, error: unknown): null {
  if (!isHashtagTopicSearchError(error)) throw error
  ctx.setStatus(error.status)
  ctx.json({ error: error.error })
  return null
}
