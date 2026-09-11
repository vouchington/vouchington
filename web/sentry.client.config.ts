import * as Sentry from '@sentry/nextjs'
import { createSentryClientInitOptions } from './sentry-client-options'

Sentry.init(createSentryClientInitOptions())
