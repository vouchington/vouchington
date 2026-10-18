export const MISSING_FEED_CONTENT_ERROR_CODE = 'RSS_FEED_URL_MISSING_CONTENT'

export function createMissingFeedContentError(): Error & {
  code: string
  status: number
  statusCode: number
} {
  const error = new Error('RSS feed URL did not return feed content') as Error & {
    code: string
    status: number
    statusCode: number
  }
  error.code = MISSING_FEED_CONTENT_ERROR_CODE
  error.status = 422
  error.statusCode = 422
  return error
}
