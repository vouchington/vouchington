/**
 * Test helpers for crawl dispatch tiering tests
 */

import { write } from '@data-stores/psql'
import { ValkeyCache } from '@data-stores/valkey/cache'
import sql from 'sql-template-strings'

const robotsTxtCache = new ValkeyCache<string>({
  prefix: 'urls-domains-robots',
  ttlSeconds: 86_400,
})

export async function setTestRobotsTxtCache(hostname: string, robotsTxt: string): Promise<void> {
  await robotsTxtCache.set(hostname, robotsTxt)
}

export async function deleteTestRobotsTxtCache(...hostnames: string[]): Promise<void> {
  await robotsTxtCache.delete(...hostnames)
}

/**
 * Create a relation__post__related__url row for testing tiered dispatch logic.
 */
export async function createEntityRelationWithElection(
  subjectId: string,
  objectUrlId: string,
  createdById: string,
  votesScoreUp: number,
): Promise<string> {
  const {
    rows: [relation],
  } = await write(sql`
    INSERT INTO "relation__post__related__url" (subject_id, object_id, created_by_id)
    VALUES (${subjectId}, ${objectUrlId}, ${createdById})
    RETURNING id
  `)
  if (votesScoreUp > 0) {
    await write(sql`
      UPDATE "relation__post__related__url"
      SET votes_score_up = ${votesScoreUp}
      WHERE id = ${relation.id}
    `)
  }
  return relation.id
}

export async function setTestPostRelatedUrlRelationScore(
  postId: string,
  urlId: string,
  score: number,
): Promise<void> {
  await write(sql`/* setTestPostRelatedUrlRelationScore */
    UPDATE relation__post__related__url
    SET votes_score_up = ${Math.max(score, 0)},
      votes_score_down = ${Math.max(-score, 0)}
    WHERE subject_id = ${postId} AND object_id = ${urlId}`)
}

/**
 * Create a user_profile_link row for testing tiered dispatch logic.
 */
export async function createTestUserProfileLink(userId: string, urlId: string): Promise<void> {
  await write(sql`
    INSERT INTO user_profile_links (user_id, link_type, url_id)
    VALUES (${userId}, 'url', ${urlId})
  `)
}
