import type { BackgroundDomainDefinition, BackgroundJobDefinition } from '../types.mts'

/** Throws when the registered jobs and domains would break the shared queue's contract. */
export function assertRegistryInvariants(
  jobs: readonly BackgroundJobDefinition[],
  definitions: readonly BackgroundDomainDefinition[],
  configuredDomains: readonly string[],
): void {
  const domains = new Set<string>(definitions.map(definition => definition.domain))
  if (new Set(jobs.map(job => job.name)).size !== jobs.length) {
    throw new Error('Background job names must be unique across domains')
  }
  if (domains.size !== definitions.length) {
    throw new Error('Background domains must be registered once')
  }
  if (configuredDomains.some(domain => !domains.has(domain))) {
    throw new Error('Every background domain needs a domain definition')
  }
  for (const job of jobs) {
    if (!domains.has(job.domain)) throw new Error(`Job ${job.name} names an unregistered domain`)
  }
}
