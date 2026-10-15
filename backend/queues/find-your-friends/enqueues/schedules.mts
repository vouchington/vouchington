import {
  defineScheduledJobManifest,
  toSchedulerTemplateOptions,
} from '@modules/scheduled-job-manifest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB } from '@queues/background/enqueues/find-your-friends-jobs'
import { enqueueDispatchFindYourFriends } from '../enqueues.mts'

export const scheduledJobManifest = defineScheduledJobManifest(BACKGROUND_QUEUE_NAME, [
  {
    schedulerId: 'dispatchFindYourFriends',
    repeat: { pattern: '0 3 * * *' },
    template: {
      name: FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB.name,
      data: {},
      opts: toSchedulerTemplateOptions({ ...FIND_YOUR_FRIENDS_ENQUEUE_DISPATCH_JOB.options }),
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
