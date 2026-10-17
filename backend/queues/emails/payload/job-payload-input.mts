import type { EmailJobInput } from '../types.mts'
import { JobPayloadError } from './job-payload-error.mts'
import {
  asRecord,
  assertExactKeys,
  optionalNullableString,
  optionalString,
} from './job-payload-read.mts'

/** Reads the recipient and metadata of an email job, rejecting anything the enqueue never sets. */
export function parseEmailInput(data: unknown): EmailJobInput {
  const record = asRecord(data, 'input')
  assertExactKeys(record, [
    'emailAddress',
    'userId',
    'trackingKey',
    'windowStart',
    'windowEnd',
    'uiLocale',
    'subject',
    'text',
    'html',
  ])
  const emailAddress = record.emailAddress
  const userId = record.userId
  optionalInputMetadata(record)
  const metadata = inputMetadata(record)
  if (typeof emailAddress === 'string' && userId === undefined) return { emailAddress, ...metadata }
  if (typeof userId === 'string' && emailAddress === undefined) return { userId, ...metadata }
  throw new JobPayloadError('input must set emailAddress or userId')
}

function inputMetadata(record: Record<string, unknown>): {
  trackingKey?: string
  windowStart?: string
  windowEnd?: string
  uiLocale?: string | null
  subject?: string
  text?: string
  html?: string
} {
  return {
    ...(typeof record.trackingKey === 'string' ? { trackingKey: record.trackingKey } : {}),
    ...(typeof record.windowStart === 'string' ? { windowStart: record.windowStart } : {}),
    ...(typeof record.windowEnd === 'string' ? { windowEnd: record.windowEnd } : {}),
    ...(typeof record.subject === 'string' ? { subject: record.subject } : {}),
    ...(typeof record.text === 'string' ? { text: record.text } : {}),
    ...(typeof record.html === 'string' ? { html: record.html } : {}),
    ...(record.uiLocale === null || typeof record.uiLocale === 'string'
      ? { uiLocale: record.uiLocale }
      : {}),
  }
}

function optionalInputMetadata(record: Record<string, unknown>): void {
  for (const key of [
    'trackingKey',
    'windowStart',
    'windowEnd',
    'subject',
    'text',
    'html',
  ] as const) {
    optionalString(record, key)
  }
  optionalNullableString(record, 'uiLocale')
}
