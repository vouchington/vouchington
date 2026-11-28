import { continueAfterFailure as runStep } from './scenario-failures.mts'
import type { OrdinaryExplainShard } from './explain-shards.mts'
import { INGESTION_CRAWL_RUNNERS } from './run-ordered-scenarios-ingestion-crawl.mts'
import { FEEDS_FOLLOWS_RUNNERS } from './run-ordered-scenarios-feeds-follows.mts'
import { SEARCH_ENTITIES_RUNNERS } from './run-ordered-scenarios-search-entities.mts'
import { IMPORTS_RETENTION_RUNNERS } from './run-ordered-scenarios-imports-retention.mts'
import { MODERATION_RUNNERS } from './run-ordered-scenarios-moderation.mts'
import { READ_PATHS_RUNNERS } from './run-ordered-scenarios-read-paths.mts'
import { STORY_ENGAGEMENT_RUNNERS } from './run-ordered-scenarios-story-engagement.mts'
import { COPYRIGHT_CASES_RUNNERS } from './run-ordered-scenarios-copyright-cases.mts'
import { MEDIA_DELIVERY_RUNNERS } from './run-ordered-scenarios-media-delivery.mts'
import { ROUND_TRIPS_RUNNERS } from './run-ordered-scenarios-round-trips.mts'
import { UPLOADS_REPORTS_RUNNERS } from './run-ordered-scenarios-uploads-reports.mts'
import { RECOVERY_RUNNERS } from './run-ordered-scenarios-recovery.mts'
import { PUBLICATION_TOPICS_RUNNERS } from './run-ordered-scenarios-publication-topics.mts'
import { RETENTION_RECOVERY_RUNNERS } from './run-ordered-scenarios-retention-recovery.mts'
import { EMBEDDINGS_PAYMENTS_RUNNERS } from './run-ordered-scenarios-embeddings-payments.mts'
import { RSS_NOTIFICATIONS_RUNNERS } from './run-ordered-scenarios-rss-notifications.mts'
import { AFTER_MEMBERSHIPS_RUNNERS } from './run-ordered-scenarios-after-memberships.mts'
import { AFTER_COMMUNITIES_RUNNERS } from './run-ordered-scenarios-after-communities.mts'
import { AFTER_NOTIFICATIONS_RUNNERS } from './run-ordered-scenarios-after-notifications.mts'
import { AFTER_ACCOUNTS_RSS_RUNNERS } from './run-ordered-scenarios-after-accounts-rss.mts'
import { AFTER_TOPICS_RUNNERS } from './run-ordered-scenarios-after-topics.mts'
import { AFTER_RETENTION_RUNNERS } from './run-ordered-scenarios-after-retention.mts'
import { CAPACITY_AUDIT_RUNNERS } from './run-capacity-audit-scenarios.mts'

export type OrderedRunner = () => Promise<unknown>

// Each domain seeds any extra corpus it needs so it can run alone on a fresh seeded database
// without depending on leftovers from earlier domains. Shared corpora live in seed-data/ helpers.
export const EXPLAIN_DOMAINS = {
  'ingestion-crawl': INGESTION_CRAWL_RUNNERS,
  'feeds-follows': FEEDS_FOLLOWS_RUNNERS,
  'search-entities': SEARCH_ENTITIES_RUNNERS,
  'imports-retention': IMPORTS_RETENTION_RUNNERS,
  moderation: MODERATION_RUNNERS,
  'read-paths': READ_PATHS_RUNNERS,
  'story-engagement': STORY_ENGAGEMENT_RUNNERS,
  'copyright-cases': COPYRIGHT_CASES_RUNNERS,
  'media-delivery': MEDIA_DELIVERY_RUNNERS,
  'round-trips': ROUND_TRIPS_RUNNERS,
  'uploads-reports': UPLOADS_REPORTS_RUNNERS,
  recovery: RECOVERY_RUNNERS,
  'publication-topics': PUBLICATION_TOPICS_RUNNERS,
  'retention-recovery': RETENTION_RECOVERY_RUNNERS,
  'embeddings-payments': EMBEDDINGS_PAYMENTS_RUNNERS,
  'rss-notifications': RSS_NOTIFICATIONS_RUNNERS,
  'after-memberships': AFTER_MEMBERSHIPS_RUNNERS,
  'after-communities': AFTER_COMMUNITIES_RUNNERS,
  'after-notifications': AFTER_NOTIFICATIONS_RUNNERS,
  'after-accounts-rss': AFTER_ACCOUNTS_RSS_RUNNERS,
  'after-topics': AFTER_TOPICS_RUNNERS,
  'after-retention': AFTER_RETENTION_RUNNERS,
  'capacity-audit': CAPACITY_AUDIT_RUNNERS,
} as const satisfies Record<string, readonly OrderedRunner[]>

export type ExplainDomain = keyof typeof EXPLAIN_DOMAINS
export const EXPLAIN_DOMAIN_NAMES = Object.keys(EXPLAIN_DOMAINS) as readonly ExplainDomain[]

// Each ordinary shard owns whole domains. Rebalance by moving a domain name between shards.
// In an unsharded run, ordinary domains run in EXPLAIN_DOMAIN_NAMES order (late writers last).
export const ORDINARY_SHARD_DOMAINS: Readonly<
  Record<OrdinaryExplainShard, readonly ExplainDomain[]>
> = {
  main: [
    'ingestion-crawl',
    'feeds-follows',
    'search-entities',
    'imports-retention',
    'after-communities',
    'after-notifications',
  ],
  'main-2': [
    'moderation',
    'read-paths',
    'story-engagement',
    'copyright-cases',
    'media-delivery',
    'round-trips',
    'uploads-reports',
    'recovery',
    'after-accounts-rss',
  ],
  'main-3': ['publication-topics', 'retention-recovery', 'after-retention'],
  'main-4': [
    'embeddings-payments',
    'rss-notifications',
    'after-memberships',
    'after-topics',
    'capacity-audit',
  ],
}

export function parseExplainDomain(value: string | undefined): ExplainDomain | undefined {
  if (value === undefined || value === '') return undefined
  const domain = EXPLAIN_DOMAIN_NAMES.find(candidate => candidate === value)
  if (domain === undefined)
    throw new Error(`Invalid EXPLAIN_DOMAIN:"${value}"; expected ${EXPLAIN_DOMAIN_NAMES.join('|')}`)
  return domain
}

export function getDomainRunners(domain: ExplainDomain): readonly OrderedRunner[] {
  return EXPLAIN_DOMAINS[domain]
}

/** The runners one ordinary shard owns; no shard runs every domain in canonical order. */
export function getOrderedRunners(
  shard: OrdinaryExplainShard | undefined,
): readonly OrderedRunner[] {
  if (shard === undefined) return EXPLAIN_DOMAIN_NAMES.flatMap(domain => EXPLAIN_DOMAINS[domain])
  return ORDINARY_SHARD_DOMAINS[shard].flatMap(domain => EXPLAIN_DOMAINS[domain])
}

export async function runOrderedRunners(runners: readonly OrderedRunner[]): Promise<void> {
  for (const runner of runners) await runStep(runner.name, runner)
}
