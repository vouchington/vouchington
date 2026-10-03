import { apiSseFrame } from '../../../response-contract.mts'
import { aggregateQueueStats, getAllQueueStats } from '@data-stores/valkey-glide-mq/get-queue-stats'
import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { currentUserCanAccessQueueStats } from '@services/queue-monitoring'
import app from '../../../app.mts'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'
import { startSSE } from '../../../sse-helpers.mts'
import '../scheduled-jobs.mts'

import { QUEUE_NAMES } from './shared.mts'

app.route('/api/v1/mq/stream').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, currentUserCanAccessQueueStats, 'GET:/api/v1/mq/stream')

  const { stream, pipelinePromise, lifecycleSignal } = startSSE(ctx)
  stream.on('error', onError)

  let inFlight = false
  const interval = setInterval(async () => {
    if (inFlight) return
    inFlight = true
    try {
      const queues = await getAllQueueStats(QUEUE_NAMES)
      const stats = aggregateQueueStats(queues)
      if (!lifecycleSignal.aborted && !stream.destroyed) {
        stream.write(
          apiSseFrame('GET:/api/v1/mq/stream', { event: 'stats', data: { stats, queues } }),
        )
      }
    } catch (err) {
      onError(err as Error)
    } finally {
      inFlight = false
    }
  }, 2000)

  const stopStream = () => {
    clearInterval(interval)
    if (!stream.destroyed && !stream.writableEnded) stream.end()
  }
  lifecycleSignal.addEventListener('abort', stopStream, { once: true })

  try {
    await pipelinePromise
  } finally {
    lifecycleSignal.removeEventListener('abort', stopStream)
    clearInterval(interval)
    if (!stream.destroyed) stream.end()
  }
})
