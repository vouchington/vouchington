import { read } from '@data-stores/psql'
import { encodeCursor } from '@modules/pagination'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { searchCommunities } from '../run-services.mts'

const LIMIT = 25
const RANKING_INDEX = 'idx_mv_trending_communities__ranking'
const options = { search: 'explain', sort: 'trending' as const, limit: LIMIT }

/** Compare the common-text walk with the plain ranking and exercise cursor boundaries. */
export async function runTrendingTextScenarios(): Promise<void> {
  const plain = await searchCommunities({ sort: 'trending', limit: LIMIT })
  const first = await searchCommunities(options)
  if (
    first.results.length !== LIMIT ||
    !first.page_info.has_next_page ||
    !first.page_info.end_cursor ||
    first.results.some((community, index) => community.id !== plain.results[index]?.id)
  )
    throw new Error('Common-text trending page did not match the plain ranking')

  registerWalk('search-communities-text-trending')
  await runAndCapture('search-communities-text-trending', async () => {
    const page = await searchCommunities(options)
    if (page.results.map(row => row.id).join(',') !== first.results.map(row => row.id).join(','))
      throw new Error('Trending first page changed identity or order')
  })

  registerWalk('search-communities-text-trending-after')
  await runAndCapture('search-communities-text-trending-after', async () => {
    const page = await searchCommunities({ ...options, after: first.page_info.end_cursor! })
    if (
      page.results.length !== LIMIT ||
      !page.page_info.has_next_page ||
      page.results.some(row => first.results.some(previous => previous.id === row.id))
    )
      throw new Error('Trending continuation did not return the next full page')
  })

  const { rows } = await read<{ id: string; trending_score: number }>(
    `/* trendingSearchEndCursor */ SELECT id, trending_score FROM mv_trending_communities
     ORDER BY trending_score ASC, id ASC LIMIT 1`,
  )
  const last = rows[0]
  if (!last) throw new Error('Trending fixture is empty')
  const endCursor = encodeCursor({ id: last.id, score: last.trending_score })
  registerScenarioContract('search-communities-text-trending-end', {
    allowEmptyResult: true,
    expectations: [{ kind: 'maxProcessedRows', relation: 'mv_trending_communities', max: 26 }],
  })
  await runAndCapture('search-communities-text-trending-end', async () => {
    const page = await searchCommunities({ ...options, after: endCursor })
    if (page.results.length !== 0 || page.page_info.has_next_page)
      throw new Error('Trending end cursor returned another page')
  })
}

function registerWalk(id: string): void {
  registerScenarioContract(id, {
    expectations: [
      { kind: 'usesIndexes', indexes: [RANKING_INDEX] },
      { kind: 'maxProcessedRows', relation: 'mv_trending_communities', max: LIMIT + 1 },
      { kind: 'custom', name: 'communityTextCandidates' },
    ],
  })
}
