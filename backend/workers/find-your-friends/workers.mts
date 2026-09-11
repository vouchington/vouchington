import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { QUEUE_NAME } from '@queues/find-your-friends/config'
import { processFindYourFriendsDispatcher } from './processors.mts'
import { syncFacebookFriends } from '@services/oauth-facebook/friends'
import { syncXFriends } from '@services/oauth-x/friends'
import { syncGithubFriends } from '@services/oauth-github/friends'
import type {
  FindYourFriendsDispatcherJobs,
  FindYourFriendsSyncJobs,
} from '@queues/find-your-friends/types'
import { Worker, type Job } from 'glide-mq'

export const findYourFriends = new Worker(
  QUEUE_NAME,
  (job: Job) => {
    const orderingKey = job.opts.ordering?.key

    switch (orderingKey) {
      case 'dispatcher': {
        switch (job.name as FindYourFriendsDispatcherJobs) {
          case 'dispatchFindYourFriends':
            return processFindYourFriendsDispatcher()
          default:
            throw new Error(`find-your-friends dispatcher job ${job.name} not found`)
        }
      }
      case 'sync_facebook': {
        switch (job.name as FindYourFriendsSyncJobs) {
          case 'syncFacebookFriends': {
            const facebookUserId = job.data?.facebookUserId
            if (!facebookUserId) throw new Error('syncFacebookFriends: facebookUserId is required')
            return syncFacebookFriends(facebookUserId)
          }
          default:
            throw new Error(`find-your-friends sync_facebook job ${job.name} not found`)
        }
      }
      case 'sync_x': {
        switch (job.name as FindYourFriendsSyncJobs) {
          case 'syncXFriends': {
            const xUserId = job.data?.xUserId
            if (!xUserId) throw new Error('syncXFriends: xUserId is required')
            return syncXFriends(xUserId)
          }
          default:
            throw new Error(`find-your-friends sync_x job ${job.name} not found`)
        }
      }
      case 'sync_github': {
        switch (job.name as FindYourFriendsSyncJobs) {
          case 'syncGithubFriends': {
            const githubUserId = job.data?.githubUserId
            if (!githubUserId) throw new Error('syncGithubFriends: githubUserId is required')
            return syncGithubFriends(githubUserId)
          }
          default:
            throw new Error(`find-your-friends sync_github job ${job.name} not found`)
        }
      }
      default:
        throw new Error(`Unknown ordering key: ${orderingKey}`)
    }
  },
  {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    concurrency: getWorkerConcurrency('findYourFriends', { baseline: 5 }),
  },
)
