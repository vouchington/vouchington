// Import with `import * as SentrySdk from '@sentry/node'` if you are using ESM
import * as SentrySdk from '@sentry/node'
import { createVouchaSentryInitOptions } from '@ts-shared/utils/sentry-init-options'
import { isExpectedCrawlerOperationalError } from './expected-crawler-operational-error.mts'

const sentryInitOptions = createVouchaSentryInitOptions({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.ENVIRONMENT,
  fallbackEnvironment: process.env.NODE_ENV || 'development',
  release: process.env.GIT_COMMIT,
  tracesSampleRate: 1.0,
  filter: { isExpected: isExpectedCrawlerOperationalError },
})

if (sentryInitOptions.enabled) SentrySdk.init(sentryInitOptions)

export default SentrySdk
