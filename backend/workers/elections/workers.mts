import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import { Worker, type Job } from 'glide-mq'
import { updateTopicElectionVoteStats } from '@services/elections-votes/topic'
import { updateHostnameElectionVoteStats } from '@services/elections-votes/hostname'
import { updateAgentModerationElectionVoteStats } from '@services/elections-votes/agent-moderation'
import { updatePostElectionVoteStats } from '@services/elections-votes/post'
import {
  resolveEntityRelationElectionTarget,
  updateEntityRelationElectionVoteStats,
} from '@services/elections-votes/entity-relation'
import { updateRssFeedItemElectionVoteStats } from '@services/elections-votes/rss-feed-item'
import { updateUserVouchElectionVoteStats } from '@services/elections-votes/user-vouch'
import { QUEUE_NAME } from '@queues/elections/config'

function getElectionId(job: Job): string {
  return job.data.electionId
}

async function processElection(job: Job): Promise<void> {
  const electionId = getElectionId(job)
  const orderingKey = job.opts.ordering?.key

  switch (orderingKey) {
    case 'topic':
      await updateTopicElectionVoteStats(electionId)
      break
    case 'hostname':
      await updateHostnameElectionVoteStats(electionId)
      break
    case 'agent_moderation':
      await updateAgentModerationElectionVoteStats(electionId)
      break
    case 'post':
      await updatePostElectionVoteStats(electionId)
      break
    case 'entity_relation': {
      const target = await resolveEntityRelationElectionTarget(electionId, job.data.relationTable)
      await updateEntityRelationElectionVoteStats(target)
      break
    }
    case 'rss_feed_item':
      await updateRssFeedItemElectionVoteStats(electionId)
      break
    case 'user_vouch':
      await updateUserVouchElectionVoteStats(electionId)
      break
    default:
      throw new Error(`Unknown ordering key: ${orderingKey}`)
  }
}

export const elections = new Worker(QUEUE_NAME, processElection, {
  connection: workerQueueConnection,
  prefix: workerQueuePrefix,
  concurrency: getWorkerConcurrency('elections', { baseline: 5 }),
})
