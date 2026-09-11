import * as Sentry from '@sentry/nextjs'
import { createSentryEdgeInitOptions } from './sentry-edge-options'

Sentry.init(createSentryEdgeInitOptions())
