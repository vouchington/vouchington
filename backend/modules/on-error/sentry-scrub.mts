import type * as SentrySdk from '@sentry/node'
import { scrubSentryEvent, scrubSpanAttributes } from '@ts-shared/utils/sentry-event-scrubbing'

type SentryInitOptions = NonNullable<Parameters<typeof SentrySdk.init>[0]>
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0]
type SentryTransactionEvent = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[0]
type SentryTransactionHint = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[1]

export function scrubSentrySpan(span: SentrySpan): SentrySpan {
  const data = scrubSpanAttributes(span.data)
  return data === span.data ? span : { ...span, data }
}

export function scrubSentryTransaction(
  event: SentryTransactionEvent,
  _hint: SentryTransactionHint,
): SentryTransactionEvent {
  return scrubSentryEvent(event)
}
