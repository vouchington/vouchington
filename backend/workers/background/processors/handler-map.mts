import type { BackgroundDomain } from '@queues/background/config'
import { BACKGROUND_JOBS } from '@queues/background/enqueues/registry'
import type { BackgroundHandler } from '@queues/background/types'

/**
 * Maps job names to handlers, rejecting a registered job without one, a handler without a
 * registered job, and a job handled twice, so a name can never reach the wrong code or no code.
 * A worker that serves only some `domains` needs handlers for those domains alone.
 */
export function buildHandlerMap(
  handlers: readonly BackgroundHandler[],
  domains?: readonly BackgroundDomain[],
): Map<string, BackgroundHandler> {
  const byName = new Map<string, BackgroundHandler>()
  for (const handler of handlers) {
    const { name } = handler.job
    if (byName.has(name)) throw new Error(`Background job ${name} has more than one handler`)
    byName.set(name, handler)
  }
  const registered = new Set(BACKGROUND_JOBS.map(job => job.name))
  for (const name of byName.keys()) {
    if (!registered.has(name)) throw new Error(`Handler ${name} has no registered job`)
  }
  const served = domains ? new Set<string>(domains) : undefined
  for (const job of BACKGROUND_JOBS) {
    if (served && !served.has(job.domain)) continue
    if (!byName.has(job.name)) throw new Error(`Background job ${job.name} has no handler`)
  }
  if (!served) return byName
  return new Map([...byName].filter(([, handler]) => served.has(handler.job.domain)))
}
