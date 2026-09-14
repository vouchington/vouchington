import * as Sentry from '@sentry/nextjs'
import { initializeSentryClient } from './sentry-client-options'

initializeSentryClient(options => Sentry.init(options))
