import type { BackgroundDomain } from '@queues/background/config'
import { BACKGROUND_JOBS } from '@queues/background/enqueues/registry'
import type { BackgroundHandler } from '@queues/background/types'

/**
 * Maps job names to handlers, rejecting a registered job without one, a handler without a
 * registered job, and a job handled twice, so a name can never reach the wrong code or no code.
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
  for (const name of registered) {
    if (!byName.has(name)) throw new Error(`Background job ${name} has no handler`)
  }
  if (!domains) return byName
  const served = new Set<string>(domains)
  return new Map([...byName].filter(([, handler]) => served.has(handler.job.domain)))
}
