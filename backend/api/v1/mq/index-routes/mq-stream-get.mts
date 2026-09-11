import type { Context } from '@jongleberry/api-server'
import onError from '@modules/on-error'
import { currentUserCanAccessQueueStats, getAllQueueStats } from '@services/queue-monitoring'
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
      let totalWaiting = 0
      let totalActive = 0
      let totalCompleted = 0
      let totalFailed = 0
      for (const q of queues) {
        totalWaiting += q.waiting
        totalActive += q.active
        totalCompleted += q.completed
        totalFailed += q.failed
      }
      const stats = {
        totalWaiting,
        totalActive,
        totalCompleted,
        totalFailed,
        queueCount: queues.length,
      }
      if (!lifecycleSignal.aborted && !stream.destroyed) {
        stream.write(`event: stats\ndata: ${JSON.stringify({ stats, queues })}\n\n`)
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
