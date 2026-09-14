// Import with `import * as SentrySdk from '@sentry/node'` if you are using ESM
import * as SentrySdk from '@sentry/node'
import { composeSentryBeforeSend } from '@ts-shared/utils/sentry-event-scrubbing'
import {
  resolveSentryDsnEnablement,
  SENTRY_CONFIGURATION_WARNING,
} from '@ts-shared/utils/sentry-deployment-gate'
import { withSpikeProtection } from '@ts-shared/utils/sentry-spike-protection'
import { isExpectedCrawlerOperationalError } from './expected-crawler-operational-error.mts'
import { createOtelSpanProcessors } from './sentry-otel.mts'
import { scrubSentrySpan, scrubSentryTransaction } from './sentry-scrub.mts'

const externalOtelAutoInstrumentationRegister = '@opentelemetry/auto-instrumentations-node/register'
type SentryInitOptions = NonNullable<Parameters<typeof SentrySdk.init>[0]> & {
  openTelemetrySpanProcessors?: ReturnType<typeof createOtelSpanProcessors>
}
export type TestSentryClient = Pick<
  typeof SentrySdk,
  'addBreadcrumb' | 'captureException' | 'captureMessage' | 'flush'
>
export type SentryMockRegistry = typeof globalThis & {
  vouchaSentryMocks?: TestSentryClient
}

type SentryInitDeps = {
  createOtelSpanProcessors?: typeof createOtelSpanProcessors
  filterSentryEvent?: typeof filterSentryEvent
  resolveSentryEnablement?: typeof resolveSentryDsnEnablement
  scrubSentrySpan?: typeof scrubSentrySpan
  scrubSentryTransaction?: typeof scrubSentryTransaction
}

let sentryConfigurationInvalidLogged = false

function warnIfSentryConfigurationInvalid(configurationInvalid: boolean): void {
  if (configurationInvalid && !sentryConfigurationInvalidLogged) {
    console.warn(SENTRY_CONFIGURATION_WARNING)
    sentryConfigurationInvalidLogged = true
  }
}

export function hasExternalOtelAutoInstrumentationPreload({
  execArgv = process.execArgv,
  nodeOptions = process.env.NODE_OPTIONS,
}: {
  execArgv?: readonly string[]
  nodeOptions?: string
} = {}): boolean {
  return [...execArgv, nodeOptions ?? ''].some(arg =>
    arg.includes(externalOtelAutoInstrumentationRegister),
  )
}

export function filterSentryEvent(
  event: SentrySdk.ErrorEvent,
  hint: SentrySdk.EventHint,
): SentrySdk.ErrorEvent | null {
  if (event.tags?.suppressLogging === true) return null
  if (isExpectedCrawlerOperationalError(hint.originalException)) return null

  const err = hint.originalException as Record<string, unknown> | null
  if (err && typeof err === 'object') {
    const message = typeof err.message === 'string' ? err.message : null
    if (message === 'Premature close') return null
    const status =
      typeof err.status === 'number'
        ? err.status
        : typeof err.statusCode === 'number'
          ? err.statusCode
          : null
    if (status !== null && status < 500) return null
    const code = typeof err.code === 'string' ? err.code : null
    if (code === 'ECONNRESET' || code === 'EPIPE') return null
  }
  return event
}

export function createSentryInitOptions(
  envVars: NodeJS.ProcessEnv = process.env,
  deps: SentryInitDeps = {},
): SentryInitOptions {
  const nodeEnv = envVars.NODE_ENV || 'development'
  const createSpanProcessors = deps.createOtelSpanProcessors ?? createOtelSpanProcessors
  const filterEvent = deps.filterSentryEvent ?? filterSentryEvent
  const resolveEnablement = deps.resolveSentryEnablement ?? resolveSentryDsnEnablement
  const beforeSendSpan = deps.scrubSentrySpan ?? scrubSentrySpan
  const beforeSendTransaction = deps.scrubSentryTransaction ?? scrubSentryTransaction
  const { enabled, environment, otelOnly, sentryDsn, configurationInvalid } = resolveEnablement({
    dsn: envVars.SENTRY_DSN,
    environment: envVars.ENVIRONMENT,
    otelEnabled: envVars.OTEL_ENABLED === '1',
  })
  warnIfSentryConfigurationInvalid(configurationInvalid)

  return {
    dsn: otelOnly ? undefined : sentryDsn?.dsn,
    tracesSampleRate: 1.0,
    environment: environment ?? nodeEnv,
    enabled,
    release: envVars.GIT_COMMIT || undefined,
    openTelemetrySpanProcessors: createSpanProcessors(envVars),

    // Mirror the onError filtering: drop 4xx errors and known noisy connection codes.
    // Applies to any direct Sentry.captureException() calls that bypass onError().
    // withSpikeProtection wraps the outer pipeline so a single recurring error can never again
    // consume a full month's Sentry error quota by itself (see sentry-spike-protection.mts).
    beforeSend: otelOnly ? () => null : withSpikeProtection(composeSentryBeforeSend(filterEvent)),

    // Scrub request URLs and credentials from errors, transactions, and spans.
    beforeSendSpan,
    beforeSendTransaction,
  }
}

function getTestSentryClient(): TestSentryClient | undefined {
  return (globalThis as SentryMockRegistry).vouchaSentryMocks
}

export function shouldInitializeSentry(
  envVars: NodeJS.ProcessEnv = process.env,
  hasExternalOtelPreload = hasExternalOtelAutoInstrumentationPreload(),
  testClient: TestSentryClient | undefined = getTestSentryClient(),
): boolean {
  const isTestRuntime = envVars.NODE_ENV === 'test'
  const testRuntimeOptIn = envVars.OTEL_ENABLED === '1'
  const hasExternalOtelOwner = envVars.OTEL_ENABLED === '1' && hasExternalOtelPreload
  return !testClient && (!isTestRuntime || testRuntimeOptIn) && !hasExternalOtelOwner
}

if (shouldInitializeSentry()) {
  SentrySdk.init(createSentryInitOptions())
}

const Sentry: TestSentryClient = {
  addBreadcrumb(...args: Parameters<TestSentryClient['addBreadcrumb']>) {
    return (getTestSentryClient() ?? SentrySdk).addBreadcrumb(...args)
  },
  captureException(...args: Parameters<TestSentryClient['captureException']>) {
    return (getTestSentryClient() ?? SentrySdk).captureException(...args)
  },
  captureMessage(...args: Parameters<TestSentryClient['captureMessage']>) {
    return (getTestSentryClient() ?? SentrySdk).captureMessage(...args)
  },
  flush(...args: Parameters<TestSentryClient['flush']>) {
    return (getTestSentryClient() ?? SentrySdk).flush(...args)
  },
}

export default Sentry
