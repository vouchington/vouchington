import * as glideMq from 'glide-mq'
import type { QueueEventsOptions } from 'glide-mq'
import type { EventEmitter } from 'node:events'

export type ElectionTerminalEventSource = Pick<EventEmitter, 'on' | 'off'> & {
  waitUntilReady(): Promise<void>
  close(): Promise<void>
}

export type ElectionTerminal = {
  id: string
  failed: boolean
  failedReason?: string
  failureCause?: unknown
}

/** Receipts supply IDs; the retained stream handles completion before the receipt is inspected. */
export function observeElectionQueueTerminals(name: string, options: QueueEventsOptions) {
  return observeElectionTerminalSource(
    new glideMq.QueueEvents(name, { ...options, lastEventId: '0-0' }),
  )
}

/** Sources are attached before owned admissions; testing sources do not emulate stream history. */
export function observeElectionTerminalSource(events: ElectionTerminalEventSource) {
  const terminals = new Map<string, ElectionTerminal>()
  const pending = new Map<string, Array<PromiseWithResolvers<ElectionTerminal>>>()
  const errors: unknown[] = []
  let closing: Promise<void> | undefined
  const rejectPending = (error: unknown) => {
    for (const waits of pending.values()) for (const wait of waits) wait.reject(error)
    pending.clear()
  }
  const onError = (error: unknown) => {
    errors.push(error)
    rejectPending(error)
  }
  const record = (terminal: ElectionTerminal) => {
    terminals.set(terminal.id, terminal)
    for (const wait of pending.get(terminal.id) ?? []) wait.resolve(terminal)
    pending.delete(terminal.id)
  }
  const completed = ({ jobId }: { jobId: string }) => record({ id: jobId, failed: false })
  const failed = (event: { jobId: string; failedReason?: string; failureCause?: unknown }) =>
    record({
      id: event.jobId,
      failed: true,
      failedReason: event.failedReason,
      ...(Object.hasOwn(event, 'failureCause') ? { failureCause: event.failureCause } : {}),
    })
  events.on('completed', completed)
  events.on('failed', failed)
  events.on('error', onError)
  async function dispose() {
    rejectPending(new Error('Owned election observer is closed'))
    try {
      await events.close()
    } catch (err) {
      errors.push(err)
    } finally {
      events.off('completed', completed)
      events.off('failed', failed)
      events.off('error', onError)
    }
    if (errors.length === 1) throw errors[0]
    if (errors.length)
      throw new AggregateError(errors, 'Owned observer errors and close failure', {
        cause: errors[0],
      })
  }
  return {
    ready: () => events.waitUntilReady(),
    async wait(id: string): Promise<ElectionTerminal> {
      if (!id) return Promise.reject(new Error('A concrete owned job ID is required'))
      if (closing) return Promise.reject(new Error('Owned election observer is closed'))
      if (errors.length) throw errors[0]
      const known = terminals.get(id)
      if (known) return Promise.resolve(known)
      const wait = Promise.withResolvers<ElectionTerminal>()
      void wait.promise.catch(() => {})
      const waits = pending.get(id) ?? []
      waits.push(wait)
      pending.set(id, waits)
      return wait.promise
    },
    close() {
      return (closing ??= Promise.resolve().then(dispose))
    },
  }
}
