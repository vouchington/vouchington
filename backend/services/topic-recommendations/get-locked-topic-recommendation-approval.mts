import type { QueryOptions } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'

type LockedTopicRecommendationApproval = {
  topic_title: string
  topic_slug: string
  topic_markdown: string | null
  aliases: string[]
  hostname_id: string | null
  hostnames: Array<{ id: string; hostname: string }>
  topic_type: 'topic' | 'referral_program' | 'card'
  example_referral_link: string | null
  landing_page_urls: string[]
}

export async function getLockedTopicRecommendationApproval(
  recommendationId: string,
  options: QueryOptions,
): Promise<LockedTopicRecommendationApproval> {
  assert(options.query, 500, 'Query options are required')

  const lockedRecommendationQuery =
    await options.query(sql`/* getLockedTopicRecommendationApproval */
    SELECT ptr.reviewed_at,
      ptr.created_topic_id,
      ptr.topic_title,
      ptr.topic_slug,
      ptr.topic_markdown,
      ptr.aliases,
      ptr.hostname_id,
      ptr.topic_type,
      ptr.example_referral_link,
      ptr.landing_page_urls,
      COALESCE((
        SELECT JSON_AGG(
          jsonb_build_object('id', vuh.id, 'hostname', vuh.hostname)
          ORDER BY vuh.hostname
        )
        FROM post_topic_recommendations_hostnames ptrh
        JOIN view_url_hostnames vuh ON vuh.id = ptrh.hostname_id
        WHERE ptrh.post_id = ptr.post_id
      ), '[]'::json) AS hostnames
    FROM post_topic_recommendations ptr
    WHERE ptr.post_id = ${recommendationId}
    FOR UPDATE
  `)
  const lockedRecommendation = lockedRecommendationQuery.rows[0]
  assert(lockedRecommendation, 404, 'Recommendation not found')
  assert(lockedRecommendation.reviewed_at === null, 422, 'Recommendation is already reviewed')

  return {
    topic_title: lockedRecommendation.topic_title as string,
    topic_slug: lockedRecommendation.topic_slug as string,
    topic_markdown: (lockedRecommendation.topic_markdown as string | null) ?? null,
    aliases: (lockedRecommendation.aliases as string[] | null) ?? [],
    hostname_id: (lockedRecommendation.hostname_id as string | null) ?? null,
    hostnames:
      (lockedRecommendation.hostnames as Array<{ id: string; hostname: string }> | null) ?? [],
    topic_type: lockedRecommendation.topic_type as string as 'topic' | 'referral_program' | 'card',
    example_referral_link: (lockedRecommendation.example_referral_link as string | null) ?? null,
    landing_page_urls: (lockedRecommendation.landing_page_urls as string[] | null) ?? [],
  }
}
