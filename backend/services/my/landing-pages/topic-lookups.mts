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
    -- no-mistakes-disable-next-line postgres-required-predicates: existing referral links may still point at merged source topics; resolve them to active destinations
    SELECT
      urpl.id,
      COALESCE(destination_topic.id, source_topic.id) AS referral_program_id,
      COALESCE(destination_topic.name, source_topic.name) AS referral_program_name,
      COALESCE(destination_topic.slug, source_topic.slug) AS referral_program_slug,
      urpl.label,
      u.url
    FROM user_referral_program_links urpl
    JOIN topics source_topic ON source_topic.id = urpl.referral_program_id
    LEFT JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    JOIN urls u ON u.id = urpl.url_id
    WHERE urpl.user_id = ${userId}
      AND urpl.id = ANY(${ids}::uuid[])
      AND source_topic.deleted_at IS NULL
      AND (
        source_topic.merged_into_topic_id IS NULL
        OR (
          destination_topic.deleted_at IS NULL
          AND destination_topic.merged_into_topic_id IS NULL
        )
      )
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
    -- no-mistakes-disable-next-line postgres-required-predicates: existing referral links may still point at merged source topics; resolve them to active destinations
    SELECT
      urpl.id,
      COALESCE(destination_topic.id, source_topic.id) AS referral_program_id,
      COALESCE(destination_topic.name, source_topic.name) AS referral_program_name,
      COALESCE(destination_topic.slug, source_topic.slug) AS referral_program_slug,
      urpl.label,
      u.url
    FROM user_referral_program_links urpl
    JOIN topics source_topic ON source_topic.id = urpl.referral_program_id
    LEFT JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    JOIN urls u ON u.id = urpl.url_id
    WHERE urpl.user_id = ${userId}
      AND source_topic.deleted_at IS NULL
      AND (
        source_topic.merged_into_topic_id IS NULL
        OR (
          destination_topic.deleted_at IS NULL
          AND destination_topic.merged_into_topic_id IS NULL
        )
      )
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
    -- no-mistakes-disable-next-line postgres-required-predicates: saved topic groups may still point at merged source topics; resolve them to active destinations
    SELECT
      requested.topic_id AS lookup_id,
      COALESCE(destination_topic.id, source_topic.id) AS id,
      COALESCE(destination_topic.name, source_topic.name) AS name,
      COALESCE(destination_topic.slug, source_topic.slug) AS slug,
      COALESCE(destination_topic.topic_type, source_topic.topic_type) AS topic_type
    FROM unnest(${ids}::uuid[]) AS requested(topic_id)
    JOIN topics source_topic ON source_topic.id = requested.topic_id
    LEFT JOIN topics destination_topic ON destination_topic.id = source_topic.merged_into_topic_id
    WHERE source_topic.deleted_at IS NULL
      AND (
        source_topic.merged_into_topic_id IS NULL
        OR (
          destination_topic.deleted_at IS NULL
          AND destination_topic.merged_into_topic_id IS NULL
        )
      )
  `)
  return new Map(
    (rows as Array<LandingPageTopic & { lookup_id: string }>).map(({ lookup_id, ...topic }) => [
      lookup_id,
      topic,
    ]),
  )
}
