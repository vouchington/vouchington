import type { BackgroundCpuDomainDefinition, BackgroundCpuJobDefinition } from '../types.mts'
import { isBackgroundCpuOrderingKey } from '../config.mts'
import { assertSharedJobOrdering } from '@data-stores/valkey-glide-mq/shared-queue-ordering'

/** Throws when the registered jobs and domains would break the shared queue's contract. */
export function assertRegistryInvariants(
  jobs: readonly BackgroundCpuJobDefinition[],
  definitions: readonly BackgroundCpuDomainDefinition[],
  configuredDomains: readonly string[],
): void {
  const domains = new Set<string>(definitions.map(definition => definition.domain))
  if (new Set(jobs.map(job => job.name)).size !== jobs.length) {
    throw new Error('Background CPU job names must be unique across domains')
  }
  if (domains.size !== definitions.length) {
    throw new Error('Background CPU domains must be registered once')
  }
  if (configuredDomains.some(domain => !domains.has(domain))) {
    throw new Error('Every background-cpu domain needs a domain definition')
  }
  for (const job of jobs) {
    if (!domains.has(job.domain)) throw new Error(`Job ${job.name} names an unregistered domain`)
    assertSharedJobOrdering(job, isBackgroundCpuOrderingKey)
  }
}
