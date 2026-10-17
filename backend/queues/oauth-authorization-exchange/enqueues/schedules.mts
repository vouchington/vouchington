import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB } from '@queues/background/enqueues/oauth-authorization-exchange-jobs'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_INTERVAL_MS,
  OAUTH_AUTHORIZATION_EXCHANGE_ORDERING,
} from '../config.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'oauthAuthorizationExchangeDispatcher',
    repeat: { every: OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_INTERVAL_MS },
    template: {
      name: OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({
        ...OAUTH_AUTHORIZATION_EXCHANGE_DISPATCH_JOB.options,
        ordering: OAUTH_AUTHORIZATION_EXCHANGE_ORDERING.dispatcher,
      }),
    },
    operatorSurfaces: [{ kind: 'backfill', backfillId: 'oauth-authorization-exchange-dispatch' }],
  },
])
