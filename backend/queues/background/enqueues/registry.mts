import { BACKGROUND_DOMAINS, type BackgroundDomain } from '../config.mts'
import type { BackgroundDomainDefinition, BackgroundJobDefinition } from '../types.mts'
import { ACCOUNT_LIFECYCLE_DOMAIN, ACCOUNT_LIFECYCLE_JOBS } from './account-lifecycle-jobs.mts'
import { ARTICLE_SYNC_DOMAIN, ARTICLE_SYNC_JOBS } from './article-sync-jobs.mts'
import { ENTITY_LISTENERS_DOMAIN, ENTITY_LISTENERS_JOBS } from './entity-listeners-jobs.mts'
import { MEMBERSHIPS_DOMAIN } from './memberships-domain.mts'
import { MEMBERSHIPS_JOBS } from './memberships-jobs-2.mts'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DOMAIN,
  OAUTH_AUTHORIZATION_EXCHANGE_JOBS,
} from './oauth-authorization-exchange-jobs.mts'
import { OPENAI_MODERATION_DOMAIN, OPENAI_MODERATION_JOBS } from './openai-moderation-jobs.mts'
import { POST_MENTIONS_DOMAIN, POST_MENTIONS_JOBS } from './post-mentions-jobs.mts'
import { POST_PUBLICATION_DOMAIN, POST_PUBLICATION_JOBS } from './post-publication-jobs.mts'
import { assertRegistryInvariants } from './registry-invariants.mts'
import { SES_INBOUND_DOMAIN, SES_INBOUND_JOBS } from './ses-inbound-jobs.mts'
import {
  STORY_POST_RELATED_URL_PROJECTIONS_DOMAIN,
  STORY_POST_RELATED_URL_PROJECTIONS_JOBS,
} from './story-post-related-url-projections-jobs.mts'
import { VOTE_AGGREGATION_DOMAIN, VOTE_AGGREGATION_JOBS } from './vote-aggregation-jobs.mts'

/** The single source of truth for what the `background` queue runs: domains and their jobs. */
export const BACKGROUND_DOMAIN_DEFINITIONS: readonly BackgroundDomainDefinition[] = [
  SES_INBOUND_DOMAIN,
  OPENAI_MODERATION_DOMAIN,
  POST_MENTIONS_DOMAIN,
  STORY_POST_RELATED_URL_PROJECTIONS_DOMAIN,
  POST_PUBLICATION_DOMAIN,
  VOTE_AGGREGATION_DOMAIN,
  ENTITY_LISTENERS_DOMAIN,
  ACCOUNT_LIFECYCLE_DOMAIN,
  ARTICLE_SYNC_DOMAIN,
  MEMBERSHIPS_DOMAIN,
  OAUTH_AUTHORIZATION_EXCHANGE_DOMAIN,
]

export const BACKGROUND_JOBS: readonly BackgroundJobDefinition[] = [
  ...SES_INBOUND_JOBS,
  ...OPENAI_MODERATION_JOBS,
  ...POST_MENTIONS_JOBS,
  ...STORY_POST_RELATED_URL_PROJECTIONS_JOBS,
  ...POST_PUBLICATION_JOBS,
  ...VOTE_AGGREGATION_JOBS,
  ...ENTITY_LISTENERS_JOBS,
  ...ACCOUNT_LIFECYCLE_JOBS,
  ...ARTICLE_SYNC_JOBS,
  ...MEMBERSHIPS_JOBS,
  ...OAUTH_AUTHORIZATION_EXCHANGE_JOBS,
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
