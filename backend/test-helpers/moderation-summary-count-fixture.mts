import { v7 as uuidv7 } from 'uuid'
import { write } from '../data-stores/psql/index.mts'
import sql from 'sql-template-strings'

/** A small owned cohort that crosses the digest's 99+ count boundary. */
export async function insertTestModerationSummaryReviewCohort(
  communityId: string,
  userId: string,
): Promise<void> {
  const instant = Date.now() - 1000
  const ids = Array.from({ length: 101 }, () => uuidv7({ msecs: instant }))
  await write(sql`/* insertTestModerationSummaryReviewCohort */
    WITH created AS (
      INSERT INTO posts(id,post_type,title,markdown,created_by_id,community_id,broadcast,privacy,
        is_anonymous,gemini_embedding_2_content_sha256,llm_moderation_content_sha256,created_via)
      SELECT id,'discussion','Digest boundary fixture','Digest boundary fixture',${userId},${communityId},'everyone','public',
        FALSE,decode(repeat('00',32),'hex'),decode(repeat('00',32),'hex'),'system'
      FROM unnest(${ids}::uuid[]) AS cohort(id)
      RETURNING id
    )
    INSERT INTO community_post_reviews(community_id,post_id,submitted_by_id)
    SELECT ${communityId},id,${userId} FROM created`)
}

/** Fresh communities with one pending item each, spanning the digest's selected-community bound. */
export async function insertTestModerationSummaryCommunityCohort(
  userId: string,
): Promise<string[]> {
  const suffix = crypto.randomUUID()
  const { rows } = await write<{ id: string }>(sql`/* insertTestModerationSummaryCommunityCohort */
    WITH created AS (
      INSERT INTO communities(name,slug,created_by_id,created_via)
      SELECT 'Digest cohort '||n,'digest-cohort-'||${suffix}||'-'||n,${userId},'system'
      FROM generate_series(1,21) n RETURNING id
    ), members AS (
      INSERT INTO community_members(community_id,user_id,role)
      SELECT id,${userId},'owner' FROM created RETURNING id
    ), created_posts AS (
      INSERT INTO posts(post_type,title,markdown,created_by_id,community_id,broadcast,privacy,is_anonymous,
        gemini_embedding_2_content_sha256,llm_moderation_content_sha256,created_via)
      SELECT 'discussion','Digest community fixture','Pending',${userId},id,'everyone','public',FALSE,
        decode(repeat('00',32),'hex'),decode(repeat('00',32),'hex'),'system' FROM created
      RETURNING id,community_id
    ), reviews AS (
      INSERT INTO community_post_reviews(community_id,post_id,submitted_by_id)
      SELECT community_id,id,${userId} FROM created_posts RETURNING post_id
    ) SELECT id FROM created ORDER BY id`)
  return rows.map(row => row.id)
}

/** Move only an owned fixture post; report ownership must continue to follow the current FK. */
export async function moveTestModerationSummaryPost(
  postId: string,
  communityId: string,
): Promise<void> {
  await write(
    sql`/* moveTestModerationSummaryPost */ UPDATE posts SET community_id=${communityId} WHERE id=${postId}`,
  )
}
