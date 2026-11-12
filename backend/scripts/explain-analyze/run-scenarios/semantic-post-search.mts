import { read } from '@data-stores/psql'
import { seedUuid } from '../seed-data/common.mts'
import { buildPostSearchQuery } from '@services/posts/search/query-builder'
import {
  executePostSearchQuery,
  SEMANTIC_POST_SEARCH_SETTINGS,
} from '@services/posts/search/execute-query'
import { runAndCapture, seedUser } from '../run-support.mts'
import { registerScenarioContract } from '../plan-expectations.mts'
import { withPositiveSemanticNeighbours } from './semantic-hot-votes.mts'
import { inspectSemanticPostSeed, recordSemanticPostFailure } from './semantic-post-diagnostics.mts'

const embedding = [1, ...Array<number>(1023).fill(0)]

export async function runSemanticPostSearchScenarios(): Promise<void> {
  const variants = [
    ...(['new', 'relevance'] as const).flatMap(sort =>
      [false, true].map(hybrid => ({ sort, hybrid, range: 'all' as const, suffix: '' })),
    ),
    // A narrow window may use an exact sort, so this one only checks the bounded candidate window.
    { sort: 'new' as const, hybrid: false, range: '1m' as const, suffix: '-1m' },
    // About 3% of the seeded neighbours have positive net votes; the net filter must apply to
    // the bounded candidate window, not inside the vector walk.
    { sort: 'hot' as const, hybrid: false, range: 'all' as const, suffix: '' },
  ]
  for (const { sort, hybrid, range, suffix } of variants) {
    const scenario = `post-search-${hybrid ? 'hybrid' : 'semantic'}-${sort}${suffix}`
    const seedOptions = {
      semantic_search_query: 'seed',
      semanticSearchEmbedding: embedding,
      ...(hybrid ? { text_search_query: 'seed' } : {}),
      sort,
      // Full history keeps the distance-ordered index the only option; -1m bounds the window.
      time_range: range,
      limit: 26,
    }
    const seed = await inspectSemanticPostSeed(seedOptions)
    console.log(`${scenario}: exact eligible seed rows=${seed.eligible_count}`)
    let options = seedOptions
    try {
      if (seed.eligible_count === 0) throw new Error(`${scenario}: no exact eligible seed rows`)
      const eligibleId = seed.eligible_sample_ids?.[0]
      if (!eligibleId) throw new Error(`${scenario}: no eligible seed id to anchor ANN search`)
      const { rows } = await read<{ embedding: string }>(
        `/* semanticPostSearchSeedEmbedding */
           SELECT gemini_embedding_2_embedding::text AS embedding
           FROM posts WHERE id = $1 AND gemini_embedding_2_embedding IS NOT NULL`,
        [eligibleId],
      )
      const anchor = rows[0]?.embedding
      if (!anchor) throw new Error(`${scenario}: eligible seed has no embedding`)
      // The 40k-row fixture is clustered. A generic vector can exhaust the bounded ANN scan
      // before reaching a filtered row, even though exact eligibility is nonempty. Query from
      // an eligible seeded post so the candidate search has a known zero-distance neighbor.
      options = { ...seedOptions, semanticSearchEmbedding: JSON.parse(anchor) as number[] }
      registerScenarioContract(scenario, {
        expectations: [{ kind: 'custom', name: 'semanticPost' }],
        crossPartition: { posts: 'Semantic post search ranks matching posts across id ranges.' },
      })
      const capture = () =>
        runAndCapture(
          scenario,
          () => executePostSearchQuery(buildPostSearchQuery(seedUser, options), true),
          undefined,
          'buildPostSearchQuery',
          { localSettings: SEMANTIC_POST_SEARCH_SETTINGS },
        )
      // no-mistakes-disable-next-line query-reached-per-item: the fixed five-variant matrix needs independent plans; the hot variant's two bounded vote writes restore the seed.
      await (sort === 'hot' ? withPositiveSemanticNeighbours(capture) : capture())
    } catch (err) {
      try {
        await recordSemanticPostFailure(scenario, options, seed)
      } catch (err_) {
        console.error(`${scenario}: secondary diagnostic failure`, err_)
      }
      throw err
    }
  }
}

export async function runSimilarPostSearchScenarios(): Promise<void> {
  const { rows } = await read<{ id: string }>(
    `/* explainSimilarRssSource */ SELECT items.id FROM rss_feed_items items
     JOIN rss_feed_item_guids ids ON ids.id = items.id
     WHERE ids.guid LIKE 'seed-item-guid-%'
       AND items.gemini_embedding_2_embedding IS NOT NULL
     ORDER BY items.id LIMIT 1`,
  )
  const rssItemId = rows[0]?.id
  if (!rssItemId) throw new Error('Missing embedded RSS source for similar-item scenarios')
  for (const sort of ['new', 'relevance'] as const) {
    for (const rss of [false, true]) {
      const scenario = `post-search-similar-${rss ? 'rss' : 'post'}-${sort}`
      registerScenarioContract(scenario, {
        expectations: [],
        crossPartition: { posts: 'Similar-item search ranks matching posts across id ranges.' },
      })
      await runAndCapture(
        scenario,
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
