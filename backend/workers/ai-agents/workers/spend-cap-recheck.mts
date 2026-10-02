import { createWorker } from '@data-stores/valkey-glide-mq'
import { SPEND_CAP_RECHECKS_QUEUE_NAME } from '@queues/ai-agents/config'
import { processSpendCapRecheckJob } from '../processors/spend-cap-recheck.mts'

export const spendCapRechecks = createWorker(
  SPEND_CAP_RECHECKS_QUEUE_NAME,
  processSpendCapRecheckJob,
  { concurrency: 1 },
)
