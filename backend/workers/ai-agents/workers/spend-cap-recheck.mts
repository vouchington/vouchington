import { createWorker } from '@data-stores/valkey-glide-mq'
import { OPENAI_SPEND_CAP_RECHECKS_QUEUE_NAME } from '@queues/ai-agents/config'
import { processOpenAiSpendCapRecheckJob } from '../processors/spend-cap-recheck.mts'

export const openAiSpendCapRechecks = createWorker(
  OPENAI_SPEND_CAP_RECHECKS_QUEUE_NAME,
  processOpenAiSpendCapRecheckJob,
  { concurrency: 1 },
)
