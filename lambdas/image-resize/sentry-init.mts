// Sentry initialization for the image-resize Lambda.
// Imported as a side effect at the top of index.mts so Sentry is configured
// before the handler is constructed.
//
// Filters 4xx errors (RequestParseError=400, S3OperationError=404 cache misses)
// since client errors and expected cache misses are not actionable.

import { initSentry, type InitSentryOptions } from '@lambdas/shared/sentry'
import type { LambdaError } from './errors.mts'

export const imageResizeSentryOptions: InitSentryOptions = {
  lambdaName: 'image-resize',
  beforeSend(event, hint) {
    const error = hint.originalException
    if (error && typeof error === 'object' && 'statusCode' in error) {
      const { statusCode } = error as LambdaError
      if (statusCode >= 400 && statusCode < 500) return null
    }
    return event
  },
}

initSentry(imageResizeSentryOptions)
