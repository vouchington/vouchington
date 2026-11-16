import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import { findYourFriendsQueue } from '../queues.mts'
import {
  FIND_YOUR_FRIENDS_DEFAULTS,
  FIND_YOUR_FRIENDS_ORDERING,
  FRIEND_DISPATCH_JOBS,
  FRIEND_DISPATCH_PROVIDERS,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { enqueueDispatchFriendsProvider } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(
  QUEUE_NAME,
  FRIEND_DISPATCH_PROVIDERS.map(provider => ({
    schedulerId: FRIEND_DISPATCH_JOBS[provider],
    repeat: { pattern: '0 3 * * *' },
    template: {
      name: FRIEND_DISPATCH_JOBS[provider],
      data: {},
      opts: {
        attempts: FIND_YOUR_FRIENDS_DEFAULTS.attempts,
        backoff: FIND_YOUR_FRIENDS_DEFAULTS.backoff,
        removeOnComplete: FIND_YOUR_FRIENDS_DEFAULTS.removeOnComplete,
        removeOnFail: FIND_YOUR_FRIENDS_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: FIND_YOUR_FRIENDS_ORDERING.dispatch_friends,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: FRIEND_DISPATCH_JOBS[provider],
        schedule: '0 3 * * *',
        description: `Dispatch "find your friends" ${provider} account syncs`,
        trigger: () => enqueueDispatchFriendsProvider(provider),
      },
      { kind: 'backfill', backfillId: `find-your-friends-dispatch-${provider}` },
    ] as const,
  })),
)

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(findYourFriendsQueue, scheduledJobManifest)
}
