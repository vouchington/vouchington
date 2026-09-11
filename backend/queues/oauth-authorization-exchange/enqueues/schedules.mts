import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCHER_PRIORITY,
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_INTERVAL_MS,
  OAUTH_AUTHORIZATION_EXCHANGE_ORDERING,
  OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME,
} from '../config.mts'
import { oauthAuthorizationExchangeQueue } from '../queues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(
  OAUTH_AUTHORIZATION_EXCHANGE_QUEUE_NAME,
  [
    {
      schedulerId: 'oauthAuthorizationExchangeDispatcher',
      repeat: { every: OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_INTERVAL_MS },
      template: {
        name: 'dispatchOAuthAuthorizationExchanges',
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 100,
          removeOnFail: 100,
          priority: OAUTH_AUTHORIZATION_EXCHANGE_DISPATCHER_PRIORITY,
          ordering: OAUTH_AUTHORIZATION_EXCHANGE_ORDERING.dispatcher,
        } satisfies JobOptions,
      },
      operatorSurfaces: [{ kind: 'backfill', backfillId: 'oauth-authorization-exchange-dispatch' }],
    },
  ],
)

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(oauthAuthorizationExchangeQueue, scheduledJobManifest)
}
