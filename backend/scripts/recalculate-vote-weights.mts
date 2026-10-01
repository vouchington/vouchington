import { enqueueRecalculateVoteWeightDispatcher } from '@queues/vote-weight/enqueues'
import onError from '@modules/on-error'

async function main() {
  console.log('Enqueuing vote weight recalculation dispatcher...')
  await enqueueRecalculateVoteWeightDispatcher(null)
  console.log('Done. Dispatcher job enqueued.')
}

main().catch(err => {
  onError(err)
  process.exit(1)
})
