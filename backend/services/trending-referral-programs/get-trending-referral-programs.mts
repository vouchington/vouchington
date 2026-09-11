import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { clampLimit } from '@modules/search-utils'
import { decodeUuidCursor, isScoreCursor, buildPageInfo } from '@modules/pagination'
import { timestampToUuidv7LowerBound } from '@data-stores/psql/config-driven/utils/partition-utils'
import type {
  TrendingReferralProgramOptions,
  TrendingReferralProgramsResult,
  TrendingReferralProgram,
} from './types.mts'

const DEFAULT_LIMIT = 10
const TIME_RANGE_MS = 30 * 24 * 60 * 60 * 1000

export async function getTrendingReferralPrograms(
  options: TrendingReferralProgramOptions,
): Promise<TrendingReferralProgramsResult> {
  const { limit, after } = options

  const safeLimit = Math.floor(clampLimit(limit, DEFAULT_LIMIT))

  const lowerBoundUuid = timestampToUuidv7LowerBound(Date.now() - TIME_RANGE_MS)

  let cursorScore: number | undefined
  let cursorId: string | undefined
  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isScoreCursor,
      'Invalid cursor format: expected score cursor',
    )
    cursorScore = cursor.score
    cursorId = cursor.id
  }

  const query = sql`/* getTrendingReferralPrograms */
    WITH scored AS (
      SELECT
        rp.topic_id AS id,
        COUNT(url.id)::DOUBLE PRECISION AS trending_score,
        COUNT(url.id)::INTEGER AS link_count
      FROM topics__referral_programs rp
      INNER JOIN topics t ON t.id = rp.topic_id
        AND t.deleted_at IS NULL
        AND t.merged_into_topic_id IS NULL
      INNER JOIN user_referral_program_links url
        ON url.referral_program_id = rp.topic_id
        AND url.id >= ${lowerBoundUuid}
        AND url.activated_at IS NOT NULL
        AND url.deleted_at IS NULL
      WHERE rp.enabled_at IS NOT NULL
        AND rp.disabled_at IS NULL
      GROUP BY rp.topic_id
    )
    SELECT id, trending_score, link_count
    FROM scored`

  if (cursorScore !== undefined && cursorId !== undefined) {
    query.append(sql`
    WHERE (trending_score, id) < (${cursorScore}, ${cursorId})`)
  }

  query.append(sql`
    ORDER BY trending_score DESC, id DESC
    LIMIT ${safeLimit + 1}
  `)

  const { rows } = await read(query)

  const hasNextPage = rows.length > safeLimit
  const referral_programs = rows.slice(0, safeLimit) as TrendingReferralProgram[]

  return {
    referral_programs,
    page_info: buildPageInfo(referral_programs, {
      hasNextPage,
      getCursor: item => ({ score: item.trending_score, id: item.id }),
    }),
  }
}
