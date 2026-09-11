'use client'

import { useSimilarEntities } from '@/hooks/use-similar-entities'
import { fetchTopics } from '@/lib/api/client/topics'
import { fetchPosts } from '@/lib/api/client/posts'
import { fetchRssFeedItems } from '@/lib/api/client/rss-feed-items'
import { createPostPathname, topicManagementHref } from '@/lib/links/entity-href'
import { getPostSlugFromType } from '@/lib/route-configs'
import { SimilarityPanel, type SimilarityPanelItem } from './similarity-panel'
import type {
  TopicsResponseBody,
  PostsResponseBody,
} from '@/types/api-responses/posts-topics-and-feeds'
import type { RssFeedItemsFeedResponseBody } from '@/types/rss-feed-items'
import { useTranslations } from '@/lib/i18n/use-translations'

type Translator = ReturnType<typeof useTranslations>

/** Minimum query length before similarity searches fire. */
const MIN_QUERY_LENGTH = 3

/** Number of similar results to request per panel. */
const SIMILAR_LIMIT = 5

/**
 * Maximum characters sent as the similarity query. Keeps GET URLs short and
 * avoids 414/network errors when markdown is several KB long.
 */
const MAX_QUERY_CHARS = 300

interface SimilarityPanelsProps {
  /** Raw form text (name + slug + markdown joined). Debounced internally. */
  query: string
  /** 'aside': used next to a form; 'stacked': used inside a scrollable dialog. */
  layout?: 'aside' | 'stacked'
  /**
   * Post ID to exclude from the Similar posts panel. Pass the reviewed
   * recommendation's post ID so the post being reviewed doesn't consume a slot.
   */
  excludePostId?: string
}

function toTopicItems(data: TopicsResponseBody | null): SimilarityPanelItem[] {
  if (!data) return []
  return data.results.flatMap(result => {
    const topic = data.topics[result.id]
    if (!topic) return []
    return [
      {
        id: result.id,
        href: topicManagementHref(topic),
        label: { kind: 'ui-text', text: topic.name },
      },
    ]
  })
}

function toPostItems(
  data: PostsResponseBody | null,
  t: Translator,
  excludePostId?: string,
): SimilarityPanelItem[] {
  if (!data) return []
  return data.results.flatMap(result => {
    if (result.id === excludePostId) return []
    const post = data.posts[result.id]
    if (!post) return []
    const text = post.title || post.markdown.slice(0, 80)
    return [
      {
        id: result.id,
        href: createPostPathname(getPostSlugFromType(post.post_type), result.id),
        label: {
          kind: 'post-content',
          content: text
            ? {
                text,
                declared_language: post.declared_language,
                lingua_rs_detected_language: post.lingua_rs_detected_language,
              }
            : null,
          fallback: t('extracted.similarity.similarityPanels.untitled_3bc7cc17'),
        },
      },
    ]
  })
}

function toNewsItems(
  data: RssFeedItemsFeedResponseBody | null,
  t: Translator,
): SimilarityPanelItem[] {
  if (!data) return []
  return data.results.flatMap(result => {
    const item = data.rss_feed_items[result.id]
    if (!item) return []
    return [
      {
        id: result.id,
        href: item.url.url,
        label: {
          kind: 'ui-text',
          text:
            item.data.title ||
            item.rss_feed?.title ||
            t('extracted.similarity.similarityPanels.untitled_f59ab8d1'),
        },
      },
    ]
  })
}

/**
 * Three similarity panels (topics / news / posts) driven by a live-debounced
 * text query. Used on admin topic-create and topic-recommendation-review
 * surfaces to surface potential duplicates before an admin acts.
 *
 * All three panels use semantic_search_query only — the query text is never
 * passed as `q` because `q` on posts acts as a mandatory tsvector WHERE
 * predicate that would exclude semantically similar but differently-worded
 * posts, and for topics text/semantic are mutually exclusive in the backend.
 *
 * The effective query is capped at MAX_QUERY_CHARS to avoid 414 errors when
 * markdown is several KB long.
 */
export function SimilarityPanels({
  query,
  layout = 'stacked',
  excludePostId,
}: SimilarityPanelsProps) {
  const t = useTranslations()
  const trimmed = query.trim()
  const enabled = trimmed.length >= MIN_QUERY_LENGTH
  // Truncate after trimming so the embedding sees the most meaningful prefix.
  const effectiveQuery = trimmed.slice(0, MAX_QUERY_CHARS)

  const { data: topicsData, isLoading: topicsLoading } = useSimilarEntities<TopicsResponseBody>({
    query: effectiveQuery,
    enabled,
    fetcher: (q, signal) =>
      fetchTopics({ semantic_search_query: q, sort: 'relevance', limit: SIMILAR_LIMIT, signal }),
  })

  // Request one extra post when excluding the reviewed recommendation post so
  // filtering it out client-side doesn't leave an empty slot in the panel.
  const postsLimit = excludePostId ? SIMILAR_LIMIT + 1 : SIMILAR_LIMIT
  const { data: postsData, isLoading: postsLoading } = useSimilarEntities<PostsResponseBody>({
    query: effectiveQuery,
    enabled,
    fetcher: (q, signal) =>
      fetchPosts({ semantic_search_query: q, sort: 'relevance', limit: postsLimit, signal }),
  })

  const { data: newsData, isLoading: newsLoading } =
    useSimilarEntities<RssFeedItemsFeedResponseBody>({
      query: effectiveQuery,
      enabled,
      fetcher: (q, signal) =>
        fetchRssFeedItems({ semantic_search_query: q, limit: SIMILAR_LIMIT, signal }),
    })

  if (!enabled) {
    return (
      <p
        className='text-sm text-muted-foreground'
        data-pw='similarity-panels-hint'
      >
        {t('extracted.similarity.similarityPanels.enterANameToCheckFor_dd84bf7d')}
      </p>
    )
  }

  const containerClass = layout === 'aside' ? 'flex flex-col gap-4' : 'space-y-4'

  return (
    <div
      className={containerClass}
      data-pw='similarity-panels'
    >
      <SimilarityPanel
        title={t('extracted.similarity.similarityPanels.similarTopics_d014c56e')}
        isLoading={topicsLoading}
        items={toTopicItems(topicsData)}
        emptyHint={t('extracted.similarity.similarityPanels.noSimilarTopicsFound_049cb1ab')}
      />
      <SimilarityPanel
        title={t('extracted.similarity.similarityPanels.similarNews_88a9420d')}
        isLoading={newsLoading}
        items={toNewsItems(newsData, t)}
        emptyHint={t('extracted.similarity.similarityPanels.noSimilarNewsFound_4c5ec206')}
      />
      <SimilarityPanel
        title={t('extracted.similarity.similarityPanels.similarPosts_d6dd62db')}
        isLoading={postsLoading}
        items={toPostItems(postsData, t, excludePostId)}
        emptyHint={t('extracted.similarity.similarityPanels.noSimilarPostsFound_816a4e9a')}
      />
    </div>
  )
}
