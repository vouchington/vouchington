import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

// CI feeds this file to node --input-type=module, so keep it valid JavaScript.
let entry = '/app/backend/package.json'
for (const spec of [
  '@backend/worker-runtime',
  '@workers/heartbeat/workers',
  '@queues/heartbeat/queues',
]) {
  entry = createRequire(entry).resolve(spec)
}
const queueUrl = pathToFileURL(entry)
const { heartbeat } = await import(queueUrl.href)
const { QUEUE_NAME } = await import(new URL('./config.mts', queueUrl).href)
const { createEnqueueFunction } = await import(
  pathToFileURL(createRequire(entry).resolve('@data-stores/valkey-glide-mq')).href
)
await createEnqueueFunction({
  queue: heartbeat,
  queueName: QUEUE_NAME,
  jobName: 'heartbeat',
  defaults: {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 100,
    priority: 10,
  },
})({ enqueuedAt: Date.now() })
process.exit(0)
