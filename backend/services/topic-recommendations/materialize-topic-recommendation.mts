import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import sql from 'sql-template-strings'
import { normalizeTopicRecommendationValues } from './shared.mts'
import { materializeTopicRecommendationUrls } from './materialize-urls.mts'

export async function materializeTopicRecommendationInput(
  currentUserId: string,
  input: Parameters<typeof normalizeTopicRecommendationValues>[0],
  options: QueryOptions,
) {
  const values = normalizeTopicRecommendationValues(input)
  const urlIds = await materializeTopicRecommendationUrls(
    currentUserId,
    values.example_referral_link,
    values.landing_page_urls,
  )
  const hostnameMap = await upsertUrlHostnames(currentUserId, values.topic_hostnames, options)
  const hostname_id = values.topic_hostname
    ? (hostnameMap.get(values.topic_hostname) ?? null)
    : null
  const hostname_ids = values.topic_hostnames.flatMap(hostname => {
    const id = hostnameMap.get(hostname)
    return id ? [id] : []
  })

  const embedding_content_sha = createPostTextEmbeddingContent({
    post_type: 'topic_recommendation',
    title: values.title,
    markdown: values.markdown,
    topic_title: values.topic_title,
    topic_slug: values.topic_slug,
    topic_markdown: values.topic_markdown ?? undefined,
    topic_hostname: values.topic_hostname ?? undefined,
    topic_hostnames: values.topic_hostnames,
    topic_aliases: values.topic_aliases,
  }).content_sha256

  return {
    ...values,
    ...urlIds,
    hostname_id,
    hostname_ids,
    embedding_content_sha,
  }
}

export async function replaceTopicRecommendationHostnames(
  postId: string,
  hostnameIds: string[],
  options: QueryOptions,
): Promise<void> {
  // Deleted ids and inserted ids are disjoint, so the CTE cannot miss a row the insert adds.
  await write(
    sql`/* replaceTopicRecommendationHostnames */
      WITH removed AS (
        DELETE FROM post_topic_recommendation_hostnames
        WHERE post_id = ${postId}
          AND hostname_id <> ALL(${hostnameIds}::uuid[])
        RETURNING hostname_id
      )
      INSERT INTO post_topic_recommendation_hostnames (post_id, hostname_id)
      SELECT ${postId}::uuid, hostnames.hostname_id
      FROM UNNEST(${hostnameIds}::uuid[]) AS hostnames(hostname_id)
      WHERE NOT EXISTS (
        SELECT 1 FROM removed WHERE removed.hostname_id = hostnames.hostname_id
      )
      ORDER BY hostnames.hostname_id
      ON CONFLICT (post_id, hostname_id) DO NOTHING
      RETURNING hostname_id
    `,
    options,
  )
}

export type MaterializedTopicRecommendationInput = Awaited<
  ReturnType<typeof materializeTopicRecommendationInput>
>
