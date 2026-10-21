import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { LandingPageCandidateReferralLink, LandingPageTopic } from './types.mts'

export async function getLandingPageReferralLinksByIds(
  userId: string,
  ids: string[],
  publicOnly: boolean,
): Promise<Map<string, LandingPageCandidateReferralLink>> {
  if (ids.length === 0) return new Map()
  const query = sql`/* getLandingPageReferralLinksByIds */
    SELECT
      urpl.id,
      topic.id AS referral_program_id,
      topic.name AS referral_program_name,
      topic.slug AS referral_program_slug,
      urpl.label,
      u.url
    -- no-mistakes-disable-next-line postgres-required-predicates: topic merges transactionally repoint referral-program foreign keys; only deletion remains relevant
    FROM user_referral_program_links urpl
    JOIN topics topic ON topic.id = urpl.referral_program_topic_id
    JOIN urls u ON u.id = urpl.url_id
    WHERE urpl.user_id = ${userId}
      AND urpl.id = ANY(${ids}::uuid[])
      AND topic.deleted_at IS NULL
      AND urpl.deleted_at IS NULL
  `
  if (publicOnly) {
    query.append(sql` AND urpl.activated_at IS NOT NULL AND urpl.deactivated_at IS NULL`)
  }
  const { rows } = await read(query)
  return new Map((rows as LandingPageCandidateReferralLink[]).map(link => [link.id, link]))
}

export async function getOwnedLandingPageReferralLinks(
  userId: string,
): Promise<LandingPageCandidateReferralLink[]> {
  const { rows } = await read(sql`/* getOwnedLandingPageReferralLinks */
    SELECT
      urpl.id,
      topic.id AS referral_program_id,
      topic.name AS referral_program_name,
      topic.slug AS referral_program_slug,
      urpl.label,
      u.url
    -- no-mistakes-disable-next-line postgres-required-predicates: topic merges transactionally repoint referral-program foreign keys; only deletion remains relevant
    FROM user_referral_program_links urpl
    JOIN topics topic ON topic.id = urpl.referral_program_topic_id
    JOIN urls u ON u.id = urpl.url_id
    WHERE urpl.user_id = ${userId}
      AND topic.deleted_at IS NULL
      AND urpl.deleted_at IS NULL
      AND urpl.activated_at IS NOT NULL
      AND urpl.deactivated_at IS NULL
    ORDER BY urpl.id DESC
  `)
  return rows as LandingPageCandidateReferralLink[]
}

export async function getLandingPageTopicsByIds(
  ids: string[],
): Promise<Map<string, LandingPageTopic>> {
  if (ids.length === 0) return new Map()
  const { rows } = await read(sql`/* getLandingPageTopicsByIds */
    SELECT id, name, slug, topic_type
    FROM topics
    WHERE id = ANY(${ids}::uuid[])
      AND deleted_at IS NULL AND merged_into_topic_id IS NULL
  `)
  return new Map((rows as LandingPageTopic[]).map(topic => [topic.id, topic]))
}
