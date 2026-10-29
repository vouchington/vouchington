import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { registerWorkerQueueScriptFile } from './glide-mq-scripts.mts'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'

const readFrontiersScript = registerWorkerQueueScriptFile(
  'ordering-lane-pending-count.lua',
  import.meta.url,
)
const COUNTER_PATTERN = /^(0|[1-9]\d*)$/

/** Conservative native frontier count includes ready, parked, active, and delayed jobs. */
export async function getOrderingLanePendingCount(
  queueName: string,
  orderingKey: string,
  prefix = workerQueuePrefix,
): Promise<number> {
  const base = `${prefix ?? 'glide'}:{${queueName}}`
  const result = await workerQueueCommandClient.invokeScript(readFrontiersScript, {
    keys: [`${base}:ordering`, `${base}:meta`],
    args: [orderingKey, `orderdone:${orderingKey}`],
  })
  if (!Array.isArray(result) || result.length !== 2)
    throw new Error('GlideMQ ordering frontiers could not be read')
  const allocatedRaw = decodeCounterValue(result[0])
  const doneRaw = decodeCounterValue(result[1])
  if (allocatedRaw === '' && doneRaw === '') return 0
  if (allocatedRaw === '') throw new Error('GlideMQ ordering allocation is missing')
  const allocated = parseCounter(allocatedRaw)
  const done = doneRaw === '' ? 0 : parseCounter(doneRaw)
  if (done > allocated) throw new Error('GlideMQ ordering completion exceeds allocation')
  return allocated - done
}

function decodeCounterValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return Buffer.from(value).toString('utf8')
  throw new Error('GlideMQ ordering frontier has an invalid value')
}

function parseCounter(value: string): number {
  if (!COUNTER_PATTERN.test(value)) throw new Error('GlideMQ ordering frontier is malformed')
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error('GlideMQ ordering frontier is out of range')
  return parsed
}
