import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import onError from '@modules/on-error'
import { createSlugFromTitle } from '@modules/utils/slugs'
import sql from 'sql-template-strings'
import { getTopicByAny } from '@services/topics'

export function checkDuplicateTopic(
  title?: string,
  url?: string,
  pageId?: string,
): Promise<{ is_duplicate: boolean; reason?: string }> {
  return checkDuplicateTopicInStore({ title, url, pageId })
}

export async function checkDuplicateTopicInStore(
  {
    title,
    url,
    pageId,
  }: {
    title?: string
    url?: string
    pageId?: string
  },
  options: QueryOptions = {},
): Promise<{ is_duplicate: boolean; reason?: string }> {
  if (!title || !url) {
    return { is_duplicate: false }
  }
  const hostname = new URL(url).hostname.toLowerCase()

  const topicSlug = createSlugFromTitle(title)
  if (!topicSlug) {
    return { is_duplicate: false }
  }

  let existingTopic = null
  try {
    existingTopic = await getTopicByAny(topicSlug, options)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 422) {
      existingTopic = null
    } else {
      const err = error as Error & {
        extra?: Record<string, unknown>
        tags?: Record<string, string>
      }
      err.extra = { ...(err.extra ?? {}), function_name: 'getTopicByAny', topic_slug: topicSlug }
      err.tags = { ...(err.tags ?? {}), operation: 'topic-lookup' }
      onError(err)
      throw error
    }
  }

  if (existingTopic) {
    return {
      is_duplicate: true,
      reason: `Topic already exists for slug "${topicSlug}"`,
    }
  }

  const duplicateWhere = sql`/* checkDuplicateTopicInStore:fragment */
    LOWER(ptr.topic_title) = LOWER(${title})
    OR ptr.topic_slug = ${topicSlug}
  `
  if (!pageId) {
    duplicateWhere.append(sql`
      OR EXISTS (
        SELECT 1
        FROM url_hostnames uh
        WHERE uh.id = ptr.hostname_id
          AND uh.hostname = ${hostname}
      )
      OR EXISTS (
        SELECT 1
        FROM post_topic_recommendations_hostnames ptrh
        JOIN url_hostnames uh ON uh.id = ptrh.hostname_id
        WHERE ptrh.post_id = ptr.post_id
          AND uh.hostname = ${hostname}
      )
    `)
  }
  if (pageId) {
    duplicateWhere.append(sql` OR ptr.topic_wikipedia_pageid = ${pageId}`)
  }

  const query = sql`/* checkDuplicateTopicInStore */
    SELECT
      ptr.post_id,
      CASE
        WHEN ptr.reviewed_at IS NULL THEN 'pending'
        WHEN ptr.created_topic_id IS NOT NULL THEN 'approved'
        ELSE 'rejected'
      END AS status
    FROM post_topic_recommendations ptr
    JOIN posts p ON p.id = ptr.post_id
    WHERE p.deleted_at IS NULL
      AND (
  `
  query.append(duplicateWhere)
  query.append(sql`
      )
    ORDER BY ptr.created_at DESC
    LIMIT 1
  `)

  const { rows } = await read(query, options)

  if (rows[0]) {
    return {
      is_duplicate: true,
      reason: `Recommendation already exists with status "${rows[0].status}"`,
    }
  }

  return { is_duplicate: false }
}
