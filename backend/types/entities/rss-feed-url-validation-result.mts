export type RssFeedUrlValidationResult =
  | { valid: true; canonicalUrl: string }
  | { valid: false; error: string }
