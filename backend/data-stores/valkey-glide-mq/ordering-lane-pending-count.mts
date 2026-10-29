import { Decoder } from '@glidemq/speedkey'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { registerWorkerQueueScriptFile } from './glide-mq-scripts.mts'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'

const readFrontiersScript = registerWorkerQueueScriptFile(
  'ordering-lane-pending-count.lua',
  import.meta.url,
)
const COUNTER_PATTERN = /^(0|[1-9]\d*)$/
const MISSING = '__missing__'

/** Conservative native frontier count includes ready, parked, active, and delayed jobs. */
export async function getOrderingLanePendingCount(
  queueName: string,
  orderingKey: string,
  prefix = workerQueuePrefix,
): Promise<number> {
  const base = `${prefix ?? 'glide'}:{${queueName}}`
  const [allocatedRaw, doneRaw] = (await workerQueueCommandClient.invokeScript(
    readFrontiersScript,
    {
      keys: [`${base}:ordering`, `${base}:meta`],
      args: [orderingKey, `orderdone:${orderingKey}`],
      decoder: Decoder.String,
    },
  )) as [string, string]
  if (allocatedRaw === MISSING && doneRaw === MISSING) return 0
  if (allocatedRaw === MISSING) throw new Error('GlideMQ ordering allocation is missing')
  const allocated = parseCounter(allocatedRaw)
  const done = doneRaw === MISSING ? 0 : parseCounter(doneRaw)
  if (done > allocated) throw new Error('GlideMQ ordering completion exceeds allocation')
  return allocated - done
}

function parseCounter(value: string): number {
  if (!COUNTER_PATTERN.test(value)) throw new Error('GlideMQ ordering frontier is malformed')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error('GlideMQ ordering frontier is out of range')
  return parsed
}
