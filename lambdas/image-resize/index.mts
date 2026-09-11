import './sentry-init.mts'
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import {
  DEFAULT_MAX_HEIGHT,
  getSourceBucket,
  getCacheBucket,
  getSideloadCacheBucket,
} from './config.mts'
import { createLambdaHandler } from './handler.mts'

export const handler: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> =
  createLambdaHandler({
    source: {
      s3_bucket_origin: {
        bucket: getSourceBucket(),
        region: 'us-west-2',
      },
      s3_bucket_cache: {
        bucket: getCacheBucket(),
        region: 'us-west-2',
      },
      widths: [100, 200, 400, 800, 1200],
      qualities: [75, 85, 95],
      maxHeight: DEFAULT_MAX_HEIGHT,
    },
    sideload: {
      s3_bucket_cache: {
        bucket: getSideloadCacheBucket(),
        region: 'us-west-2',
      },
      widths: [100, 200, 400, 800, 1200],
      qualities: [75, 85, 95],
      maxHeight: DEFAULT_MAX_HEIGHT,
    },
  })
