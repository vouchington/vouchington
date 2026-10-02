import { read } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'
import { buildPostSearchQuery } from '@services/posts/search/query-builder'
import {
  executePostSearchQuery,
  SEMANTIC_POST_SEARCH_SETTINGS,
} from '@services/posts/search/execute-query'
import { runAndCapture, seedUser } from '../run-support.mts'

const embedding = [1, ...Array<number>(1023).fill(0)]

export async function runSemanticPostSearchScenarios(): Promise<void> {
  for (const sort of ['new', 'relevance'] as const) {
    for (const hybrid of [false, true]) {
      await runAndCapture(
        `post-search-${hybrid ? 'hybrid' : 'semantic'}-${sort}`,
        () =>
          executePostSearchQuery(
            buildPostSearchQuery(seedUser, {
              semantic_search_query: 'seed',
              semanticSearchEmbedding: embedding,
              ...(hybrid ? { text_search_query: 'seed' } : {}),
              sort,
              limit: 26,
            }),
            true,
          ),
        undefined,
        'buildPostSearchQuery',
        { localSettings: SEMANTIC_POST_SEARCH_SETTINGS },
      )
    }
  }
}

export async function runSimilarPostSearchScenarios(): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* explainSimilarRssSource */ SELECT items.id FROM rss_feed_items items
     JOIN rss_feed_item_ids ids ON ids.id = items.id
     WHERE ids.guid LIKE 'seed-item-guid-%'
       AND items.bedrock_nova_multimodal_v1_embedding IS NOT NULL
     ORDER BY items.id LIMIT 1`,
  )
  const rssItemId = rows[0]?.id
  if (!rssItemId) throw new Error('Missing embedded RSS source for similar-item scenarios')
  for (const sort of ['new', 'relevance'] as const) {
    for (const rss of [false, true]) {
      await runAndCapture(
        `post-search-similar-${rss ? 'rss' : 'post'}-${sort}`,
        () =>
          executePostSearchQuery(
            buildPostSearchQuery(seedUser, {
              ...(rss
                ? { similar_rss_feed_item_id: rssItemId }
                : { similar_post_id: seedUuid(19, '05') }),
              sort,
              limit: 26,
            }),
            false,
          ),
        undefined,
        'buildPostSearchQuery',
      )
    }
  }
}
