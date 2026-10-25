// Import with `import * as SentrySdk from '@sentry/node'` if you are using ESM
import * as SentrySdk from '@sentry/node'
import { createVouchaSentryInitOptions } from '@ts-shared/utils/sentry-init-options'
import { isExpectedCrawlerOperationalError } from './expected-crawler-operational-error.mts'

export type TestSentryClient = Pick<
  typeof SentrySdk,
  'addBreadcrumb' | 'captureException' | 'captureMessage' | 'flush' | 'suppressTracing'
>
export type SentryMockRegistry = typeof globalThis & {
  vouchaSentryMocks?: TestSentryClient
}

export function createSentryInitOptions(envVars: NodeJS.ProcessEnv = process.env) {
  return createVouchaSentryInitOptions({
    dsn: envVars.SENTRY_DSN,
    environment: envVars.ENVIRONMENT,
    fallbackEnvironment: envVars.NODE_ENV || 'development',
    release: envVars.GIT_COMMIT,
    tracesSampleRate: 1.0,
    filter: { isExpected: isExpectedCrawlerOperationalError },
  })
}

function getTestSentryClient(): TestSentryClient | undefined {
  return (globalThis as SentryMockRegistry).vouchaSentryMocks
}

export function shouldInitializeSentry(
  envVars: NodeJS.ProcessEnv = process.env,
  testClient: TestSentryClient | undefined = getTestSentryClient(),
): boolean {
  return !testClient && envVars.NODE_ENV !== 'test'
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
  suppressTracing<T>(callback: () => T): T {
    return (getTestSentryClient() ?? SentrySdk).suppressTracing(callback)
  },
}

export default Sentry
