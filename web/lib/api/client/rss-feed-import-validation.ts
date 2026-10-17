export const MAX_RSS_FEED_IMPORT_BODY_BYTES = 2 * 1024 * 1024

export type RssFeedImportBody = {
  urls?: string[]
  opml?: string
  csv?: string
  should_follow_imported_feeds?: boolean
}

export class RssFeedImportValidationError extends Error {
  readonly code: 'body_too_large'

  constructor(code: 'body_too_large', message: string) {
    super(message)
    this.code = code
    this.name = 'RssFeedImportValidationError'
  }
}

export function validateRssFeedImportBody(body: RssFeedImportBody): void {
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_RSS_FEED_IMPORT_BODY_BYTES) {
    throw new RssFeedImportValidationError(
      'body_too_large',
      'RSS feed import request exceeds 2 MiB',
    )
  }
}
