import { encodeCursor } from '@modules/pagination'
import { read } from '@data-stores/psql'
import { searchUrlHostnames } from '@services/urls-hostnames/search'
import { searchTopHostnames } from '@services/urls-hostnames/search-top'
import sql from 'sql-template-strings'

const PAGE_SIZE = 25

export type VoteScoreRankingCursors = Readonly<{
  top: string
  topicTop: string
  trustZero: string
}>

export const VOTE_SCORE_HOSTNAME_ROWS = {
  url_hostnames: 504_017,
} as const

export const VOTE_SCORE_PUBLISHER_ROWS = {
  url_hostnames: 4_017,
  relation__topic__publisher_type__topic: 201_000,
  relation__post__category__topic: 50_212,
} as const

export async function prepareVoteScoreRankingCursors(): Promise<VoteScoreRankingCursors> {
  const top = await getScoreCursorForHostname('vote-score-plan-2500.example.com', 'positive')
  const trustZero = await getScoreCursorForHostname('vote-score-plan-250000.example.com', 'zero')
  const trustPage = await searchUrlHostnames({ sort: 'trust', limit: PAGE_SIZE })
  if (trustPage.results.some(row => row.votes_score_net <= 0))
    throw new Error('Unfiltered trust sort must rank voted hostnames before zero-score ties')
  if (!trustPage.page_info.has_next_page)
    throw new Error('Vote-score trust fixture must return a continuation page')
  return { top, topicTop: top, trustZero }
}

async function getScoreCursorForHostname(
  hostname: string,
  expectedScore: 'positive' | 'zero',
): Promise<string> {
  const { rows } = await read<{ id: string; score: number }>(sql`/* getScoreCursorForHostname */
    SELECT id, votes_score_sort AS score
    FROM url_hostnames
    WHERE hostname = ${hostname}
  `)
  const row = rows[0]
  if (!row) throw new Error(`Vote-score cursor hostname is missing: ${hostname}`)
  if (expectedScore === 'positive' ? row.score <= 0 : row.score !== 0)
    throw new Error(`Vote-score cursor hostname has an unexpected score: ${hostname}`)
  return encodeCursor({ score: row.score, id: row.id })
}

export async function runTopHostnameContinuation(
  cursor: string,
  topicId?: string,
): Promise<unknown> {
  const page = await searchTopHostnames({ topic_id: topicId, limit: PAGE_SIZE, after: cursor })
  if (page.results.length !== PAGE_SIZE || !page.page_info.has_next_page)
    throw new Error('Deep voted-hostname continuation must have a full page')
  return page
}

export async function runZeroTrustContinuation(cursor: string): Promise<unknown> {
  const page = await searchUrlHostnames({ sort: 'trust', limit: PAGE_SIZE, after: cursor })
  if (
    page.results.length !== PAGE_SIZE ||
    !page.page_info.has_next_page ||
    page.results.some(row => row.votes_score_net !== 0)
  )
    throw new Error('Deep zero-score trust continuation must contain a full tied page')
  return page
}
