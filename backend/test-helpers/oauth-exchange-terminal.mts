import type { QueueEvents } from 'glide-mq'

/** Observe only the owned job's final stream disposition, never a retrying attempt. */
export function observeOAuthExchangeTerminal(
  events: QueueEvents,
  jobId: string,
  onError: (err: unknown) => void,
) {
  const terminal = Promise.withResolvers<{
    state: 'completed' | 'failed'
    failedReason?: string
  }>()
  // Readiness and admission may fail before the caller awaits completion.
  void terminal.promise.catch(() => undefined)
  events.on('error', err => {
    onError(err)
    terminal.reject(err)
  })
  events.on('completed', (event: { jobId: string }) => {
    if (event.jobId === jobId) terminal.resolve({ state: 'completed' })
  })
  events.on('failed', (event: { jobId: string; failedReason: string }) => {
    if (event.jobId === jobId)
      terminal.resolve({ state: 'failed', failedReason: event.failedReason })
  })
  return terminal
}
