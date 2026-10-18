import type { BackgroundCpuDomain } from '@queues/background-cpu/config'
import { BACKGROUND_CPU_JOBS } from '@queues/background-cpu/enqueues/registry'
import type { BackgroundCpuHandler } from '@queues/background-cpu/types'

/**
 * Maps job names to handlers, rejecting a registered job without one, a handler without a
 * registered job, and a job handled twice, so a name can never reach the wrong code or no code.
 * A worker that serves only some `domains` needs handlers for those domains alone.
 */
export function buildCpuHandlerMap(
  handlers: readonly BackgroundCpuHandler[],
  domains?: readonly BackgroundCpuDomain[],
): Map<string, BackgroundCpuHandler> {
  const byName = new Map<string, BackgroundCpuHandler>()
  for (const handler of handlers) {
    const { name } = handler.job
    if (byName.has(name)) throw new Error(`Background job ${name} has more than one handler`)
    byName.set(name, handler)
  }
  const registered = new Set(BACKGROUND_CPU_JOBS.map(job => job.name))
  for (const name of byName.keys()) {
    if (!registered.has(name)) throw new Error(`Handler ${name} has no registered job`)
  }
  const served = domains ? new Set<string>(domains) : undefined
  for (const job of BACKGROUND_CPU_JOBS) {
    if (served && !served.has(job.domain)) continue
    if (!byName.has(job.name)) throw new Error(`Background job ${job.name} has no handler`)
  }
  if (!served) return byName
  return new Map([...byName].filter(([, handler]) => served.has(handler.job.domain)))
}
