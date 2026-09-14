// Shared Sentry initialization for all Lambda functions.
// Uses @sentry/aws-serverless with NODE_OPTIONS="--import @sentry/aws-serverless/awslambda-auto"
// for automatic handler wrapping. This module configures the DSN, environment, and filtering.
//
// Enabled only for ENVIRONMENT=staging|production, or when OTel-only mode opts in.

import * as Sentry from '@sentry/aws-serverless'
import {
  composeSentryBeforeSend,
  scrubSentryEvent,
  scrubSpanAttributes,
} from '@ts-shared/utils/sentry-event-scrubbing'
import {
  resolveSentryDsnEnablement,
  SENTRY_CONFIGURATION_WARNING,
} from '@ts-shared/utils/sentry-deployment-gate'
import { withSpikeProtection } from '@ts-shared/utils/sentry-spike-protection'
import { getDeployEnvironment } from '@ts-shared/deploy-environment'
import { createOtelSpanProcessors } from './sentry-otel.mts'

const DEFAULT_TRACES_SAMPLE_RATE = 1.0
const REDACTED = '[Filtered]'
const EMAIL_REDACTED = '[Filtered email]'
const TOKEN_REDACTED = '[Filtered token]'
const SENSITIVE_FIELD_NAME_PATTERN =
  /authorization|cookie|set-cookie|password|passwd|secret|token|api[_-]?key|access[_-]?key|email|dsn|credential/i
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const AUTH_TOKEN_PATTERN = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+\b/gi
const TOKEN_ASSIGNMENT_PATTERN =
  /\b((?:access[_-]?token|refresh[_-]?token|id[_-]?token|token|secret|password|passwd|api[_-]?key)=)[^&\s]+/gi

type SentryInitOptions = NonNullable<Parameters<typeof Sentry.init>[0]>
type SentryInitOptionsWithOtel = SentryInitOptions & {
  openTelemetrySpanProcessors?: ReturnType<typeof createOtelSpanProcessors>
}
type BeforeSend = NonNullable<SentryInitOptions['beforeSend']>
type SentrySpan = Parameters<NonNullable<SentryInitOptions['beforeSendSpan']>>[0]
type SentryTransactionEvent = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[0]
type SentryTransactionHint = Parameters<NonNullable<SentryInitOptions['beforeSendTransaction']>>[1]

let sentryConfigurationInvalidLogged = false

function warnIfSentryConfigurationInvalid(configurationInvalid: boolean): void {
  if (configurationInvalid && !sentryConfigurationInvalidLogged) {
    console.warn(SENTRY_CONFIGURATION_WARNING)
    sentryConfigurationInvalidLogged = true
  }
}

export interface InitSentryOptions {
  lambdaName: string
  beforeSend?: BeforeSend
}

export function captureException(error: unknown): void {
  Sentry.captureException(error)
}

export function initSentry({ lambdaName, beforeSend }: InitSentryOptions): void {
  const { enabled, environment, otelOnly, sentryDsn, configurationInvalid } =
    resolveSentryDsnEnablement({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.ENVIRONMENT,
      otelEnabled: process.env.OTEL_ENABLED === '1',
    })
  warnIfSentryConfigurationInvalid(configurationInvalid)

  const sentryInitOptions: SentryInitOptionsWithOtel = {
    dsn: otelOnly ? undefined : sentryDsn?.dsn,
    // resolveSentryDsnEnablement() passes ENVIRONMENT through unchanged; when it's unset, fall back
    // to the shared deploy-environment accessor (ENVIRONMENT ?? NODE_ENV ?? 'development') rather
    // than a hand-rolled NODE_ENV-only read.
    environment: environment ?? getDeployEnvironment(),
    release: process.env.GIT_COMMIT ?? undefined,
    enabled,
    tracesSampleRate: getTracesSampleRate(),
    initialScope: {
      tags: { lambda: lambdaName },
    },
    // withSpikeProtection wraps the outer pipeline so a single recurring error can never again
    // consume a full month's Sentry error quota by itself (see sentry-spike-protection.mts).
    beforeSend: otelOnly
      ? () => null
      : withSpikeProtection(
          composeSentryBeforeSend(beforeSend, event =>
            scrubSentryEvent(scrubSensitiveSentryEvent(event)),
          ),
        ),
    // Scrub request URLs and credentials from errors, transactions, and spans.
    beforeSendSpan: scrubSentrySpan,
    beforeSendTransaction: scrubSentryTransaction,
    openTelemetrySpanProcessors: createOtelSpanProcessors(),
  }

  Sentry.init(sentryInitOptions)
}

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

function getTracesSampleRate(): number {
  const value = getNonEmptyEnv('SENTRY_TRACES_SAMPLE_RATE')
  if (!value) return DEFAULT_TRACES_SAMPLE_RATE

  const sampleRate = Number(value)
  if (!Number.isFinite(sampleRate) || sampleRate < 0 || sampleRate > 1) {
    return DEFAULT_TRACES_SAMPLE_RATE
  }

  return sampleRate
}

function getNonEmptyEnv(name: string): string | undefined {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function scrubSensitiveSentryEvent<T>(event: T): T {
  return scrubValue(event) as T
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return value
  if (typeof value === 'string') return scrubString(value)
  if (Array.isArray(value)) {
    return value.map(item => scrubValue(item, depth + 1))
  }
  if (!isPlainRecord(value)) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, fieldValue]) => [
      key,
      SENSITIVE_FIELD_NAME_PATTERN.test(key) ? REDACTED : scrubValue(fieldValue, depth + 1),
    ]),
  )
}

function scrubString(value: string): string {
  return value
    .replace(AUTH_TOKEN_PATTERN, `$1 ${TOKEN_REDACTED}`)
    .replace(TOKEN_ASSIGNMENT_PATTERN, `$1${TOKEN_REDACTED}`)
    .replace(EMAIL_PATTERN, EMAIL_REDACTED)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
