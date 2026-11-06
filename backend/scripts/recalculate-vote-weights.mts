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
    enqueueVoteWeightAgeMilestones({}, { deduplicationId: 'backfill:vote-weight-age-milestones' }),
    enqueueVoteWeightMembershipExpirations(
      {},
      { deduplicationId: 'backfill:vote-weight-membership-expirations' },
    ),
    enqueueVoteWeightFamilySourceChanges(
      {},
      { deduplicationId: 'backfill:vote-weight-family-source-changes' },
    ),
    enqueueVoteWeightDirtyMarkers({}, { deduplicationId: 'backfill:vote-weight-dirty-markers' }),
  ])
  console.log('Done. Dispatcher jobs enqueued.')
}

main().catch((err: unknown) => {
  onError(err instanceof Error ? err : new Error(String(err), { cause: err }))
  process.exit(1)
})
