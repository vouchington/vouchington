import { BACKGROUND_DOMAINS, type BackgroundDomain } from '../config.mts'
import type { BackgroundDomainDefinition, BackgroundJobDefinition } from '../types.mts'
import { OPENAI_MODERATION_DOMAIN, OPENAI_MODERATION_JOBS } from './openai-moderation-jobs.mts'
import { assertRegistryInvariants } from './registry-invariants.mts'
import { SES_INBOUND_DOMAIN, SES_INBOUND_JOBS } from './ses-inbound-jobs.mts'

/** The single source of truth for what the `background` queue runs: domains and their jobs. */
export const BACKGROUND_DOMAIN_DEFINITIONS: readonly BackgroundDomainDefinition[] = [
  SES_INBOUND_DOMAIN,
  OPENAI_MODERATION_DOMAIN,
]

export const BACKGROUND_JOBS: readonly BackgroundJobDefinition[] = [
  ...SES_INBOUND_JOBS,
  ...OPENAI_MODERATION_JOBS,
]

const jobsByName = new Map(BACKGROUND_JOBS.map(job => [job.name, job]))
const domainsById = new Map(BACKGROUND_DOMAIN_DEFINITIONS.map(domain => [domain.domain, domain]))

assertRegistryInvariants(BACKGROUND_JOBS, BACKGROUND_DOMAIN_DEFINITIONS, BACKGROUND_DOMAINS)

export function getBackgroundJob(name: string): BackgroundJobDefinition | undefined {
  return jobsByName.get(name)
}

export function getBackgroundDomainDefinition(
  domain: BackgroundDomain,
): BackgroundDomainDefinition {
  return domainsById.get(domain)!
}

export function getBackgroundJobNames(domain: BackgroundDomain): string[] {
  return BACKGROUND_JOBS.flatMap(job => (job.domain === domain ? [job.name] : []))
}

/** The shared worker's concurrency: the combined load of every domain it replaced. */
export function getBackgroundWorkerBaseline(): number {
  return BACKGROUND_DOMAIN_DEFINITIONS.reduce(
    (total, domain) => total + domain.workerConcurrency,
    0,
  )
}
