/** Builds the bounded seed batch that appends post ballots and their matching current state. */
export function buildPostVoteStateSeedSql(values: string): string {
  return `/* seedExplainData */
    WITH input_data AS (
      SELECT post_id::uuid AS post_id, user_id::uuid AS user_id, score::smallint AS score
      FROM (VALUES ${values}) raw(post_id, user_id, score)
    ), inserted AS (
      INSERT INTO post_votes (post_id, user_id, score)
      SELECT post_id, user_id, score FROM input_data WHERE TRUE
      ON CONFLICT DO NOTHING
      RETURNING post_id, user_id, id, score, score_is_neutral, score_is_semantic,
        outbound_activitypub_like_activity_id
    ), existing AS (
      SELECT vote.post_id, vote.user_id, vote.id, vote.score, vote.score_is_neutral,
        vote.score_is_semantic, vote.outbound_activitypub_like_activity_id
      FROM post_votes vote
      JOIN (SELECT DISTINCT post_id, user_id FROM input_data) input
        ON input.post_id = vote.post_id AND input.user_id = vote.user_id
    ), current_votes AS (
      SELECT DISTINCT ON (post_id, user_id) post_id, user_id, id, score,
        score_is_neutral, score_is_semantic, outbound_activitypub_like_activity_id
      FROM (SELECT * FROM inserted UNION ALL SELECT * FROM existing) ballots
      ORDER BY post_id, user_id, id DESC
    )
    INSERT INTO post_vote_states (
      post_id, user_id, id, score, score_is_neutral, score_is_semantic,
      outbound_activitypub_like_activity_id
    )
    SELECT post_id, user_id, id, score, score_is_neutral, score_is_semantic,
      outbound_activitypub_like_activity_id
    FROM current_votes
    WHERE TRUE
    ON CONFLICT (post_id, user_id) DO UPDATE SET
      id = EXCLUDED.id,
      score = EXCLUDED.score,
      score_is_neutral = EXCLUDED.score_is_neutral,
      score_is_semantic = EXCLUDED.score_is_semantic,
      outbound_activitypub_like_activity_id = EXCLUDED.outbound_activitypub_like_activity_id
    WHERE post_vote_states.id < EXCLUDED.id`
}
