import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import { createPostTextEmbeddingContent } from '@services/posts/content'
import { upsertUrlHostnames } from '@services/urls-hostnames'
import sql from 'sql-template-strings'
import { normalizeTopicRecommendationValues } from './shared.mts'

export async function materializeTopicRecommendationInput(
  currentUserId: string,
  input: Parameters<typeof normalizeTopicRecommendationValues>[0],
  options: QueryOptions,
) {
  const values = normalizeTopicRecommendationValues(input)
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
  await write(
    sql`/* replaceTopicRecommendationHostnames */
      DELETE FROM post_topic_recommendations_hostnames
      WHERE post_id = ${postId}
    `,
    options,
  )

  if (hostnameIds.length === 0) return

  await write(
    sql`/* replaceTopicRecommendationHostnames */
      INSERT INTO post_topic_recommendations_hostnames (post_id, hostname_id)
      SELECT input.post_id, input.hostname_id
      FROM (
        SELECT ${postId}::uuid AS post_id, hostname_id
        FROM UNNEST(${hostnameIds}::uuid[]) AS hostnames(hostname_id)
      ) AS input
      ORDER BY input.post_id ASC NULLS LAST, input.hostname_id ASC NULLS LAST
      ON CONFLICT (post_id, hostname_id) DO NOTHING
    `,
    options,
  )
}

export type MaterializedTopicRecommendationInput = Awaited<
  ReturnType<typeof materializeTopicRecommendationInput>
>
