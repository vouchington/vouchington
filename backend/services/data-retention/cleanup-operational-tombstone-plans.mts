import { getRetentionCutoffDate } from './cleanup-options.mts'

export type Family =
  | 'activitypub_post_likes'
  | 'remote_actors'
  | 'feed_hostname_blocks'
  | 'other_hostname_blocks'
  | 'deleted_conversations'
  | 'app_attestation_keys'
export type GenericFamily = Exclude<Family, 'deleted_conversations'>
export type Plan = {
  table: string
  timestamp: string
  predicate: string
  candidatePredicate?: string
} & (
  | { retentionDays: number; retentionMonths?: never }
  | { retentionMonths: number; retentionDays?: never }
)

export function getPlanCutoffDate(plan: Plan, now = new Date()): Date {
  if (plan.retentionMonths === undefined) return getRetentionCutoffDate(plan.retentionDays, now)
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - plan.retentionMonths)
  const lastDay = new Date(
    Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0),
  ).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff
}

export const PLANS: Record<GenericFamily, Plan> = {
  activitypub_post_likes: {
    table: 'activitypub_post_likes',
    timestamp: 'source.deleted_at',
    predicate: 'source.deleted_at IS NOT NULL',
    retentionDays: 30,
  },
  remote_actors: {
    table: 'remote_actors',
    timestamp: 'source.fetched_at',
    // Advance the bounded keyset over protected cache rows too. Child references are
    // checked only by DELETE, after the raw page has already been capped.
    candidatePredicate: 'source.deleted_at IS NULL',
    predicate: `source.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM relation__remote_actor__follow__user relation
        WHERE relation.subject_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM activitypub_post_likes like_row
        WHERE like_row.remote_actor_id = source.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM activitypub_inbox_delivery_work_items work_item
        WHERE work_item.remote_actor_id = source.id
      )`,
    retentionDays: 90,
  },
  feed_hostname_blocks: {
    table: 'url_hostname_blocks',
    timestamp: 'source.lifted_at',
    predicate: 'source.lifted_at IS NOT NULL AND source.domain_blocklist_source_id IS NOT NULL',
    retentionDays: 30,
  },
  other_hostname_blocks: {
    table: 'url_hostname_blocks',
    timestamp: 'source.lifted_at',
    predicate: 'source.lifted_at IS NOT NULL AND source.domain_blocklist_source_id IS NULL',
    retentionMonths: 24,
  },
  app_attestation_keys: {
    table: 'app_attestation_keys',
    timestamp: 'COALESCE(source.last_used_at, uuid_extract_timestamp(source.id))',
    predicate: 'TRUE',
    retentionDays: 180,
  },
}
