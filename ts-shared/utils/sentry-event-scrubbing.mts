import {
  scrubEventBreadcrumbs,
  scrubRequestUrlFields,
  scrubSpanUrlAttributes,
} from './observability-scrubbing.mts'
import {
  SENSITIVE_VALUE,
  scrubHeaders as scrubUpstreamHeaders,
  scrubSpanAttributes as scrubUpstreamSpanAttributes,
} from '@vouchington/utils/observability'

export const SENTRY_FILTERED_VALUE = SENSITIVE_VALUE

const CREDENTIAL_HEADER_NAMES: readonly string[] = Object.freeze([
  'authorization',
  'proxy-authorization',
  'x-api-key',
  'cf-access-jwt-assertion',
  'x-cf-worker-secret',
  'x-bedrock-batch-shared-key',
  'x-voucha-cache-purge-secret',
  'x-app-attest-assertion',
  'x-app-attest-nonce',
  'x-app-attest-challenge-id',
  'stripe-signature',
  'signature',
  'cookie',
])
const CREDENTIAL_HEADER_ATTRIBUTE_KEYS: readonly string[] = Object.freeze(
  CREDENTIAL_HEADER_NAMES.flatMap(name => [
    `http.request.header.${name}`,
    `http.request.header.${name.replaceAll('-', '_')}`,
  ]),
)
const SENTRY_SCRUB_OPTIONS = { credentialHeaders: CREDENTIAL_HEADER_NAMES } as const

export function scrubSpanCredentialAttributes<TData extends Record<string, unknown>>(
  data: TData,
): TData {
  const credentialEntries = Object.entries(data).filter(([key]) => isCredentialSpanAttribute(key))
  if (!credentialEntries.length) return data
  const credentialData = Object.fromEntries(credentialEntries)
  const scrubbedCredentialData = scrubUpstreamSpanAttributes(credentialData, SENTRY_SCRUB_OPTIONS)
  if (sameEntries(credentialData, scrubbedCredentialData)) return data
  const result: Array<[string, unknown]> = []
  for (const [key, value] of Object.entries(data)) {
    result.push([key, isCredentialSpanAttribute(key) ? scrubbedCredentialData[key] : value])
  }
  return Object.fromEntries(result) as TData
}

export function scrubSpanAttributes<TData extends Record<string, unknown>>(data: TData): TData {
  return scrubUpstreamSpanAttributes(scrubSpanUrlAttributes(data), SENTRY_SCRUB_OPTIONS)
}

export function scrubRequestCredentialFields<TRequest extends object>(
  request: TRequest | undefined,
): TRequest | undefined {
  if (!request) return request
  const fields = request as Record<string, unknown>
  const headers = fields.headers
  const cookies = fields.cookies
  const headersNeedScrubbing =
    isRecord(headers) &&
    Object.entries(headers).some(
      ([name, value]) => isCredentialHeader(name) && value !== SENTRY_FILTERED_VALUE,
    )
  const cookiesNeedScrubbing =
    isRecord(cookies) && Object.values(cookies).some(value => value !== SENTRY_FILTERED_VALUE)
  if (!headersNeedScrubbing && !cookiesNeedScrubbing) return request

  return {
    ...request,
    ...(headersNeedScrubbing ? { headers: scrubCredentialHeaders(headers) } : {}),
    ...(cookiesNeedScrubbing ? { cookies: scrubCookies(cookies) } : {}),
  }
}

export interface SentryEventLike {
  breadcrumbs?: Array<{ data?: Record<string, unknown> }>
  request?: object
}

export function scrubSentryEvent<TEvent extends SentryEventLike>(event: TEvent): TEvent {
  const breadcrumbs = scrubEventBreadcrumbs(event.breadcrumbs)
  const request = scrubRequestCredentialFields(scrubRequestUrlFields(event.request))
  if (breadcrumbs === event.breadcrumbs && request === event.request) return event
  return {
    ...event,
    ...(breadcrumbs === event.breadcrumbs ? {} : { breadcrumbs }),
    ...(request === event.request ? {} : { request }),
  }
}

type BeforeSendResult<TEvent> = TEvent | null | PromiseLike<TEvent | null>
type BeforeSend<TEvent, THint> = (event: TEvent, hint: THint) => BeforeSendResult<TEvent>

export function composeSentryBeforeSend<TEvent extends SentryEventLike, THint>(
  beforeSend?: BeforeSend<TEvent, THint>,
  finalScrubber: (event: TEvent) => TEvent = scrubSentryEvent,
): BeforeSend<TEvent, THint> {
  return (event, hint) => {
    const result = beforeSend ? beforeSend(event, hint) : event
    if (isPromiseLike<TEvent | null>(result)) {
      return result.then(nextEvent => (nextEvent === null ? null : finalScrubber(nextEvent)))
    }
    return result === null ? null : finalScrubber(result)
  }
}

function isCredentialSpanAttribute(key: string): boolean {
  return (
    CREDENTIAL_HEADER_ATTRIBUTE_KEYS.includes(key) || key.startsWith('http.request.header.cookie.')
  )
}

function isCredentialHeader(name: string): boolean {
  return CREDENTIAL_HEADER_NAMES.includes(name.toLowerCase())
}

function scrubCredentialHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const credentialHeaders = Object.fromEntries(
    Object.entries(headers).filter(([name]) => isCredentialHeader(name)),
  )
  const scrubbedCredentialHeaders = scrubUpstreamHeaders(credentialHeaders, CREDENTIAL_HEADER_NAMES)
  const result: Array<[string, unknown]> = []
  for (const [name, value] of Object.entries(headers)) {
    result.push([name, isCredentialHeader(name) ? scrubbedCredentialHeaders[name] : value])
  }
  return Object.fromEntries(result)
}

function scrubCookies(cookies: Record<string, unknown>): Record<string, unknown> {
  const result: Array<[string, unknown]> = []
  for (const name of Object.keys(cookies)) {
    result.push([name, SENTRY_FILTERED_VALUE])
  }
  return Object.fromEntries(result)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false
  return typeof (value as { then?: unknown }).then === 'function'
}

function sameEntries(
  original: Record<string, unknown>,
  candidate: Record<string, unknown>,
): boolean {
  const originalEntries = Object.entries(original)
  return (
    originalEntries.length === Object.keys(candidate).length &&
    originalEntries.every(
      ([key, value]) => Object.hasOwn(candidate, key) && candidate[key] === value,
    )
  )
}
