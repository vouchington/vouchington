import { BACKGROUND_DOMAINS, type BackgroundDomain } from '../config.mts'
import type { BackgroundDomainDefinition, BackgroundJobDefinition } from '../types.mts'
import { ACCOUNT_LIFECYCLE_DOMAIN, ACCOUNT_LIFECYCLE_JOBS } from './account-lifecycle-jobs.mts'
import { ACTIVITYPUB_DOMAIN } from './activitypub-domain.mts'
import { ACTIVITYPUB_JOBS } from './activitypub-jobs.mts'
import { ARTICLE_SYNC_DOMAIN, ARTICLE_SYNC_JOBS } from './article-sync-jobs.mts'
import {
  BLUESKY_FOLLOW_PROPAGATION_DOMAIN,
  BLUESKY_FOLLOW_PROPAGATION_JOBS,
} from './bluesky-follow-propagation-jobs.mts'
import { CACHE_PURGE_DOMAIN, CACHE_PURGE_JOBS } from './cache-purge-jobs.mts'
import { EMAIL_DIGESTS_DOMAIN } from './email-digests-domain.mts'
import { EMAIL_DIGESTS_JOBS } from './email-digests-jobs.mts'
import { ENTITY_LISTENERS_DOMAIN, ENTITY_LISTENERS_JOBS } from './entity-listeners-jobs.mts'
import {
  FOLLOWER_DISTRIBUTIONS_DOMAIN,
  FOLLOWER_DISTRIBUTIONS_JOBS,
} from './follower-distributions-jobs.mts'
import { IMPORTS_DOMAIN, IMPORTS_JOBS } from './imports-jobs.mts'
import { KAGI_SMALLWEB_DOMAIN, KAGI_SMALLWEB_JOBS } from './kagi-smallweb-jobs.mts'
import { MODERATION_SIGNALS_DOMAIN, MODERATION_SIGNALS_JOBS } from './moderation-signals-jobs.mts'
import { NOTIFICATIONS_DOMAIN } from './notifications-domain.mts'
import { NOTIFICATIONS_JOBS } from './notifications-jobs.mts'
import {
  OAUTH_AUTHORIZATION_EXCHANGE_DOMAIN,
  OAUTH_AUTHORIZATION_EXCHANGE_JOBS,
} from './oauth-authorization-exchange-jobs.mts'
import { OPENAI_MODERATION_DOMAIN, OPENAI_MODERATION_JOBS } from './openai-moderation-jobs.mts'
import { POST_MENTIONS_DOMAIN, POST_MENTIONS_JOBS } from './post-mentions-jobs.mts'
import { POST_PUBLICATION_DOMAIN, POST_PUBLICATION_JOBS } from './post-publication-jobs.mts'
import { assertRegistryInvariants } from './registry-invariants.mts'
import { RSS_FEEDS_DOMAIN, RSS_FEEDS_JOBS } from './rss-feeds-jobs.mts'
import {
  FEDIVERSE_INSTANCES_DOMAIN,
  FEDIVERSE_INSTANCES_JOBS,
} from './fediverse-instances-jobs.mts'
import { SES_INBOUND_DOMAIN, SES_INBOUND_JOBS } from './ses-inbound-jobs.mts'
import { SITEMAPS_DOMAIN, SITEMAPS_JOBS } from './sitemaps-jobs.mts'
import {
  STORY_POST_RELATED_URL_PROJECTIONS_DOMAIN,
  STORY_POST_RELATED_URL_PROJECTIONS_JOBS,
} from './story-post-related-url-projections-jobs.mts'
import {
  URLS_DOMAINS_BLACKLIST_DOMAIN,
  URLS_DOMAINS_BLACKLIST_JOBS,
} from './urls-domains-blacklist-jobs.mts'
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
  OAUTH_AUTHORIZATION_EXCHANGE_DOMAIN,
  NOTIFICATIONS_DOMAIN,
  ACTIVITYPUB_DOMAIN,
  FOLLOWER_DISTRIBUTIONS_DOMAIN,
  BLUESKY_FOLLOW_PROPAGATION_DOMAIN,
  RSS_FEEDS_DOMAIN,
  FEDIVERSE_INSTANCES_DOMAIN,
  URLS_DOMAINS_BLACKLIST_DOMAIN,
  SITEMAPS_DOMAIN,
  CACHE_PURGE_DOMAIN,
  KAGI_SMALLWEB_DOMAIN,
  EMAIL_DIGESTS_DOMAIN,
  IMPORTS_DOMAIN,
  MODERATION_SIGNALS_DOMAIN,
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
  ...OAUTH_AUTHORIZATION_EXCHANGE_JOBS,
  ...NOTIFICATIONS_JOBS,
  ...ACTIVITYPUB_JOBS,
  ...FOLLOWER_DISTRIBUTIONS_JOBS,
  ...BLUESKY_FOLLOW_PROPAGATION_JOBS,
  ...RSS_FEEDS_JOBS,
  ...FEDIVERSE_INSTANCES_JOBS,
  ...URLS_DOMAINS_BLACKLIST_JOBS,
  ...SITEMAPS_JOBS,
  ...CACHE_PURGE_JOBS,
  ...KAGI_SMALLWEB_JOBS,
  ...EMAIL_DIGESTS_JOBS,
  ...IMPORTS_JOBS,
  ...MODERATION_SIGNALS_JOBS,
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
