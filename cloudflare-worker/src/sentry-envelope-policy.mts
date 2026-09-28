import {
  getSentryEnvelopeDiagnostics,
  type SentryEnvelopeDiagnostics,
} from '@vouchington/utils/sentry-envelope'

/** Distinct item types recorded on a tunnel failure. The parser cap lives in the platform package. */
export const MAX_SENTRY_DIAGNOSTIC_ITEM_TYPES = 8

export function readSentryEnvelopeDiagnostics(
  envelope: string,
  maxBytes: number,
): SentryEnvelopeDiagnostics {
  return getSentryEnvelopeDiagnostics(envelope, {
    maxBytes,
    maxItemTypes: MAX_SENTRY_DIAGNOSTIC_ITEM_TYPES,
  })
}
