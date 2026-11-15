import { read } from '@data-stores/psql'
import { trackVoteDrift } from '@services/analytics'
import sql from 'sql-template-strings'
import { getElectionsVotesWorkLimit } from '../work-limits.mts'

const SCORE_EPSILON = 0.001

export interface VoteDriftResult {
  entityTable: string
  sampled: number
  inspected: number
  capped: number
  afterId?: string
  drifted: number
  sampleEntityId?: string
}

interface DriftRow {
  inspected: number
  capped: number
  after_id: string | null
  sampled: number
  drifted: number
  sample_entity_id: string | null
}

interface ReconcilePostVoteDriftOptions {
  /** Restrict a reconciliation to owned posts, without changing production's newest-N sample. */
  samplePostIds?: readonly string[]
  afterId?: string
}

/**
 * Reconcile denormalized `posts.votes_count_*` against the source-of-truth `post_votes` for a
 * bounded page of posts, and emit the drift to analytics. Both the stored counters
 * and the recomputed scores/counts are read from the same replica snapshot, so replica lag cannot
 * create false positives. This also detects stale Like/Dislike-strength totals from old-writer
 * Vouch/Disavow rows. Capped posts are reported without drawing a drift conclusion. The dispatcher persists continuation in job data.
 */
export async function reconcilePostVoteDrift(
  sampleSize: number = getElectionsVotesWorkLimit('vote_drift_sample_size'),
  options: ReconcilePostVoteDriftOptions = {},
): Promise<VoteDriftResult> {
  const voteLimit = getElectionsVotesWorkLimit('vote_drift_votes_per_post')
  const samplePostIds = options.samplePostIds ? [...options.samplePostIds] : null
  const query = sql`/* reconcilePostVoteDrift */
    WITH sample AS (
      SELECT id
      -- no-mistakes-disable-next-line postgres-required-predicates: the LIMIT-capped newest-N sample covers votes on posts of every age, so no parent-post UUID floor can be imposed
      FROM posts
      WHERE deleted_at IS NULL
        AND (${options.afterId ?? null}::uuid IS NULL OR id < ${options.afterId ?? null}::uuid)
        AND (${samplePostIds}::uuid[] IS NULL OR id = ANY(${samplePostIds}::uuid[]))
      ORDER BY id DESC
      LIMIT ${sampleSize}
    ),
    recomputed AS (
      SELECT
        s.id AS post_id,
        COALESCE(MAX(cv.inspected_votes), 0) > ${voteLimit} AS votes_capped,
        COALESCE(SUM(CASE WHEN cv.score > 0 THEN (CASE WHEN cv.score = 1 AND NOT cv.score_is_semantic AND p.post_type <> 'topic_recommendation' THEN 2 ELSE cv.score END) * u.vote_weight ELSE 0 END), 0)::double precision AS rs_up,
        COALESCE(SUM(CASE WHEN cv.score = 0 AND cv.score_is_neutral THEN u.vote_weight ELSE 0 END), 0)::double precision AS rs_none,
        COALESCE(-SUM(CASE WHEN cv.score < 0 THEN (CASE WHEN cv.score = -1 AND NOT cv.score_is_semantic AND p.post_type <> 'topic_recommendation' THEN -2 ELSE cv.score END) * u.vote_weight ELSE 0 END), 0)::double precision AS rs_down,
        COUNT(*) FILTER (WHERE cv.score > 0 AND u.id IS NOT NULL)::int AS rc_up,
        COUNT(*) FILTER (WHERE cv.score = 0 AND cv.score_is_neutral AND u.id IS NOT NULL)::int AS rc_none,
        COUNT(*) FILTER (WHERE cv.score < 0 AND u.id IS NOT NULL)::int AS rc_down
      FROM sample s
      JOIN posts p ON p.id = s.id
      LEFT JOIN LATERAL (
        SELECT DISTINCT ON (user_id) user_id, score, score_is_neutral, score_is_semantic,
          COUNT(*) OVER () AS inspected_votes
        FROM (
          SELECT id, user_id, score, score_is_neutral, score_is_semantic
          FROM post_votes
          WHERE post_id = s.id
          ORDER BY id DESC
          LIMIT ${voteLimit + 1}
        ) inspected_votes
        ORDER BY user_id, id DESC
      ) cv ON TRUE
      LEFT JOIN users u ON u.id = cv.user_id AND u.deleted_at IS NULL
      GROUP BY s.id, p.post_type
    ),
    drift AS (
      SELECT p.id
      FROM posts p
      JOIN recomputed r ON r.post_id = p.id
      WHERE NOT r.votes_capped AND (p.votes_score_up IS NULL
         OR ABS(p.votes_score_up - r.rs_up) > ${SCORE_EPSILON}
         OR p.votes_score_none IS NULL
         OR ABS(p.votes_score_none - r.rs_none) > ${SCORE_EPSILON}
         OR p.votes_score_down IS NULL
         OR ABS(p.votes_score_down - r.rs_down) > ${SCORE_EPSILON}
         OR p.votes_count_up   IS DISTINCT FROM r.rc_up
         OR p.votes_count_none IS DISTINCT FROM r.rc_none
         OR p.votes_count_down IS DISTINCT FROM r.rc_down)
    )
    SELECT
      (SELECT count(*) FROM recomputed WHERE NOT votes_capped)::int AS sampled,
      (SELECT count(*) FROM sample)::int AS inspected,
      (SELECT count(*) FROM recomputed WHERE votes_capped)::int AS capped,
      (SELECT id FROM sample ORDER BY id LIMIT 1)::text AS after_id,
      (SELECT count(*) FROM drift)::int AS drifted,
      (SELECT id FROM drift LIMIT 1)::text AS sample_entity_id`

  const { rows } = await read<DriftRow>(query)
  const row = rows[0] ?? {
    sampled: 0,
    inspected: 0,
    capped: 0,
    after_id: null,
    drifted: 0,
    sample_entity_id: null,
  }

  const result: VoteDriftResult = {
    entityTable: 'posts',
    sampled: row.sampled,
    inspected: row.inspected,
    capped: row.capped,
    ...(row.inspected === sampleSize && row.after_id ? { afterId: row.after_id } : {}),
    drifted: row.drifted,
    sampleEntityId: row.sample_entity_id ?? undefined,
  }

  trackVoteDrift(result)
  return result
}
