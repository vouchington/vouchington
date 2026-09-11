export const MAX_RSS_FEED_IMPORT_ITEMS = 500
export const MAX_RSS_FEED_IMPORT_BODY_BYTES = 2 * 1024 * 1024

export type RssFeedImportBody = {
  urls?: string[]
  opml?: string
  csv?: string
  follow?: boolean
}

export class RssFeedImportValidationError extends Error {
  readonly code: 'too_many_items' | 'body_too_large'

  constructor(code: 'too_many_items' | 'body_too_large', message: string) {
    super(message)
    this.code = code
    this.name = 'RssFeedImportValidationError'
  }
}

export function validateRssFeedImportBody(body: RssFeedImportBody): void {
  if (body.urls && body.urls.length > MAX_RSS_FEED_IMPORT_ITEMS) {
    throw new RssFeedImportValidationError(
      'too_many_items',
      `Maximum ${MAX_RSS_FEED_IMPORT_ITEMS} URLs per import`,
    )
  }
  if (new TextEncoder().encode(JSON.stringify(body)).byteLength > MAX_RSS_FEED_IMPORT_BODY_BYTES) {
    throw new RssFeedImportValidationError(
      'body_too_large',
      'RSS feed import request exceeds 2 MiB',
    )
  }
}
