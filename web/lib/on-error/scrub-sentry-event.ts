import type * as Sentry from '@sentry/nextjs'
import {
  composeSentryBeforeSend,
  scrubSentryEvent,
  scrubSpanAttributes,
} from '@ts-shared/utils/sentry-event-scrubbing'
import { filterSentryEvent } from './filter-sentry-event'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0]
type SentryTransactionEvent = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[0]
type SentryTransactionHint = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[1]

export const scrubSentryError = composeSentryBeforeSend(filterSentryEvent)

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
