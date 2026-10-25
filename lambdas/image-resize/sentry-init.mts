// Sentry initialization for the image-resize Lambda.
// Imported as a side effect at the top of index.mts so Sentry is configured
// before the handler is constructed. The shared event filter drops 4xx errors
// (RequestParseError=400, S3OperationError=404 cache misses) since client errors and
// expected cache misses are not actionable.

import { initSentry } from '@lambdas/shared/sentry'

initSentry({ lambdaName: 'image-resize' })
