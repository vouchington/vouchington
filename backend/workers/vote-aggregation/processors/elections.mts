import type { Job } from 'glide-mq'
import type { ElectionJobData } from '@queues/background/enqueues/vote-aggregation-jobs'
import { updateTopicElectionVoteStats } from '@services/elections-votes/topic'
import { updateHostnameElectionVoteStats } from '@services/elections-votes/hostname'
import { updateAgentModerationElectionVoteStats } from '@services/elections-votes/agent-moderation'
import { updatePostElectionVoteStats } from '@services/elections-votes/post'
import {
  createEntityRelationElectionTarget,
  updateEntityRelationElectionVoteStats,
} from '@services/elections-votes/entity-relation'
import { updateRssFeedItemElectionVoteStats } from '@services/elections-votes/rss-feed-item'
import { updateUserVouchElectionVoteStats } from '@services/elections-votes/user-vouch'

export async function processElection(job: Job<ElectionJobData>): Promise<void> {
  const { electionId, orderingKey } = job.data

  switch (job.data.orderingKey) {
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
      const target = createEntityRelationElectionTarget(electionId, job.data.relationTable)
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
