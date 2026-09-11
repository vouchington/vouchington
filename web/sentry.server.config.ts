import * as Sentry from '@sentry/nextjs'
import { createSentryServerInitOptions } from './sentry-server-options'

Sentry.init(createSentryServerInitOptions())
