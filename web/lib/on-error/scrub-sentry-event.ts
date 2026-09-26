import type * as Sentry from '@sentry/nextjs'
import {
  composeSentryBeforeSend,
  scrubSpanAttributes,
} from '@ts-shared/utils/sentry-event-scrubbing'
import { filterSentryEvent } from './filter-sentry-event'

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0]

export const scrubSentryError = composeSentryBeforeSend(filterSentryEvent)

export function scrubSentrySpan(span: SentrySpan): SentrySpan {
  const attributes = scrubSpanAttributes(span.attributes)
  return attributes === span.attributes ? span : { ...span, attributes }
}
