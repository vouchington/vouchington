import type { JobOptions } from 'glide-mq'
import {
  defineScheduledJobManifest,
  upsertScheduledJobManifest,
} from '@modules/scheduled-job-manifest'
import type { FindYourFriendsDispatcherJobs } from '../types.mts'
import { findYourFriendsQueue } from '../queues.mts'
import {
  FIND_YOUR_FRIENDS_ORDERING,
  FIND_YOUR_FRIENDS_DEFAULTS,
  PRIORITY_DISPATCHER,
  QUEUE_NAME,
} from '../config.mts'
import { enqueueDispatchFindYourFriends } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(QUEUE_NAME, [
  {
    schedulerId: 'dispatchFindYourFriends',
    repeat: { pattern: '0 3 * * *' },
    template: {
      name: 'dispatchFindYourFriends' as FindYourFriendsDispatcherJobs,
      data: {},
      opts: {
        attempts: FIND_YOUR_FRIENDS_DEFAULTS.attempts,
        backoff: FIND_YOUR_FRIENDS_DEFAULTS.backoff,
        removeOnComplete: FIND_YOUR_FRIENDS_DEFAULTS.removeOnComplete,
        removeOnFail: FIND_YOUR_FRIENDS_DEFAULTS.removeOnFail,
        priority: PRIORITY_DISPATCHER,
        ordering: FIND_YOUR_FRIENDS_ORDERING.dispatcher,
      } satisfies JobOptions,
    },
    operatorSurfaces: [
      {
        kind: 'scheduled-jobs',
        id: 'dispatchFindYourFriends',
        schedule: '0 3 * * *',
        description: 'Dispatch "find your friends" social matching',
        trigger: enqueueDispatchFindYourFriends,
      },
      { kind: 'backfill', backfillId: 'find-your-friends-dispatch' },
    ],
  },
])

export async function upsertSchedules(): Promise<void> {
  await upsertScheduledJobManifest(findYourFriendsQueue, scheduledJobManifest)
}
