import type * as SentrySdk from '@sentry/node'
import { scrubSpanAttributes } from '@ts-shared/utils/sentry-event-scrubbing'

type SentryInitOptions = NonNullable<Parameters<typeof SentrySdk.init>[0]>
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0]

export function scrubSentrySpan(span: SentrySpan): SentrySpan {
  const attributes = scrubSpanAttributes(span.attributes)
  return attributes === span.attributes ? span : { ...span, attributes }
}
