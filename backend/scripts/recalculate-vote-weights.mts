import {
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
} from '@queues/vote-aggregation/enqueues/vote-weight'
import onError from '@modules/on-error'

async function main() {
  console.log('Enqueuing vote weight signal dispatchers...')
  await Promise.all([
    enqueueVoteWeightAgeMilestones(),
    enqueueVoteWeightMembershipExpirations(),
    enqueueVoteWeightFamilySourceChanges(),
  ])
  console.log('Done. Dispatcher jobs enqueued.')
}

main().catch(err => {
  onError(err)
  process.exit(1)
})
