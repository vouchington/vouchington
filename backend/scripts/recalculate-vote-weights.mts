import {
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
  enqueueVoteWeightDirtyMarkers,
} from '@queues/vote-aggregation/enqueues/vote-weight'
import onError from '@modules/on-error'

async function main() {
  console.log('Enqueuing vote weight signal dispatchers...')
  await Promise.all([
    enqueueVoteWeightAgeMilestones({ fullReplay: true }),
    enqueueVoteWeightMembershipExpirations({ fullReplay: true }),
    enqueueVoteWeightFamilySourceChanges({ fullReplay: true }),
    enqueueVoteWeightDirtyMarkers({}),
  ])
  console.log('Done. Dispatcher jobs enqueued.')
}

main().catch(err => {
  onError(err)
  process.exit(1)
})
