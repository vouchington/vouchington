import { read, sqlOrGroup } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import onError from '@modules/on-error'
import { createSlugFromTitle } from '@modules/utils/slugs'
import { getTopicByAny } from '@services/topics'
import { toolsSearchTopicsSemantic } from '@services/topics/tools/semantic'
import sql from 'sql-template-strings'

type ExactTopic = { id: string; name: string; slug: string; topic_type: string }
type PendingRecommendation = { post_id: string; topic_title: string; topic_slug: string }
type SimilarTopic = { id: string; name: string; slug: string; topic_type: string }

export type FindTopicRecommendationDuplicatesResult = {
  exact_topic: ExactTopic | null
  pending_recommendations: PendingRecommendation[]
  similar_topics: SimilarTopic[]
}

type FindTopicRecommendationDependencies = {
  getTopicByAny: typeof getTopicByAny
  toolsSearchTopicsSemantic: typeof toolsSearchTopicsSemantic
}

const defaultFindTopicRecommendationDependencies: FindTopicRecommendationDependencies = {
  getTopicByAny,
  toolsSearchTopicsSemantic,
}

export async function findTopicRecommendationDuplicates(
  {
    topic_title,
    topic_slug,
    topic_aliases,
    topic_markdown,
    skipSimilarTopics = false,
    skipTitleMatchInPending = false,
  }: {
    topic_title: string
    topic_slug: string
    topic_aliases?: string[]
    topic_markdown?: string
    /** Skip the embedding-based semantic search. Use on write paths where only exact/pending checks matter. */
    skipSimilarTopics?: boolean
    /**
     * When true, the pending-recommendation check matches only by slug (not by title).
     * Use on the create path to avoid blocking on semantically-related but differently-slugged
     * recommendations, and to stay idempotent on persistent test databases.
     */
    skipTitleMatchInPending?: boolean
  },
  options: QueryOptions = {},
  dependencies: FindTopicRecommendationDependencies = defaultFindTopicRecommendationDependencies,
): Promise<FindTopicRecommendationDuplicatesResult> {
  const candidateSlugs = [
    ...new Set(
      [
        topic_slug.toLowerCase().trim(),
        createSlugFromTitle(topic_title),
        ...(topic_aliases ?? []).map(a => createSlugFromTitle(a)),
      ].filter(Boolean),
    ),
  ]

  const exact_topic = await findExactTopic(candidateSlugs, topic_title, options, dependencies)

  const pending_recommendations = exact_topic
    ? []
    : await findPendingRecommendations(
        candidateSlugs,
        skipTitleMatchInPending ? null : topic_title,
        options,
      )

  const similar_topics = skipSimilarTopics
    ? []
    : await findSimilarTopics(topic_title, topic_markdown, exact_topic, dependencies)

  return { exact_topic, pending_recommendations, similar_topics }
}

async function findExactTopic(
  candidateSlugs: string[],
  topic_title: string,
  options: QueryOptions,
  dependencies: FindTopicRecommendationDependencies,
): Promise<ExactTopic | null> {
  const bySlug = await Promise.all(
    candidateSlugs.map(slug =>
      dependencies.getTopicByAny(slug, options).catch((error: unknown) => {
        if (
          typeof error === 'object' &&
          error !== null &&
          'status' in error &&
          error.status === 422
        ) {
          return null
        }
        throw error
      }),
    ),
  )
  const slugMatch = bySlug.find(t => t != null) ?? null
  if (slugMatch)
    return {
      id: slugMatch.id,
      name: slugMatch.name,
      slug: slugMatch.slug,
      topic_type: slugMatch.topic_type,
    }

  // A topic may have a custom slug that doesn't derive from the title. Check by
  // name as a fallback since names have a UNIQUE LOWER(name) constraint.
  const { rows } = await read(
    sql`/* findExactTopic:byName */
      SELECT t.id, t.name, t.slug, t.topic_type
      FROM topics t
      WHERE LOWER(t.name) = LOWER(${topic_title.trim()})
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
      LIMIT 1
    `,
    options,
  )
  const nameMatch = rows[0] as ExactTopic | undefined
  return nameMatch ?? null
}

async function findPendingRecommendations(
  candidateSlugs: string[],
  topic_title: string | null,
  options: QueryOptions,
): Promise<PendingRecommendation[]> {
  const duplicatePredicates = [sql`ptr.topic_slug = ANY(${candidateSlugs}::text[])`]
  if (topic_title) {
    duplicatePredicates.push(sql`LOWER(ptr.topic_title) = LOWER(${topic_title.trim()})`)
  }
  const base = sql`/* findPendingRecommendations */
      SELECT ptr.post_id, ptr.topic_title, ptr.topic_slug
      FROM post_topic_recommendations ptr
      JOIN posts p ON p.id = ptr.post_id
      WHERE p.deleted_at IS NULL
        AND ptr.reviewed_at IS NULL
        AND `
  base.append(sqlOrGroup(duplicatePredicates))
  base.append(sql`
      ORDER BY ptr.created_at DESC
      LIMIT 5`)
  const { rows } = await read(base, options)
  return rows as PendingRecommendation[]
}

async function findSimilarTopics(
  topic_title: string,
  topic_markdown: string | undefined,
  exact_topic: ExactTopic | null,
  dependencies: FindTopicRecommendationDependencies,
): Promise<SimilarTopic[]> {
  if (!topic_title) return []

  try {
    const query = [topic_title, topic_markdown].filter(Boolean).join(' ').trim().slice(0, 300)
    const raw = await dependencies.toolsSearchTopicsSemantic(query, 5)
    const excludeId = exact_topic?.id
    return raw.filter(t => t.id !== excludeId)
  } catch (err) {
    onError(err as Error)
    return []
  }
}
