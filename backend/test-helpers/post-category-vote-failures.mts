import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getEntityRelationMetadataOrThrow } from '../services/entity-relations/metadata.mts'
import { getEntityRelationVoteTableName } from '@voucha/types/entities/entity-relations-metadata'

const topicRelation = getEntityRelationMetadataOrThrow({
  subjectType: 'post',
  objectType: 'topic',
  predicate: 'category',
})
const voteTable = getEntityRelationVoteTableName(topicRelation)
const hashtagVoteTable = getEntityRelationVoteTableName(
  getEntityRelationMetadataOrThrow({
    subjectType: 'post',
    objectType: 'topic_alias',
    predicate: 'category',
  }),
)

/** Rejects only the fresh fixture actor's category votes, preserving parallel test isolation. */
export async function withRejectedPostCategoryVotes<T>(
  actorId: string,
  execute: () => Promise<T>,
): Promise<T> {
  const name = `test_category_vote_failure_${randomBytes(8).toString('hex')}`
  const escapedActorId = actorId.replaceAll("'", "''")
  await write(`/* withRejectedPostCategoryVotes:createFunction */
    CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW.user_id = '${escapedActorId}'::uuid THEN
        RAISE EXCEPTION 'category vote rejected for test';
      END IF;
      RETURN NEW;
    END
    $body$`)
  try {
    await write(`/* withRejectedPostCategoryVotes:createTrigger */
      CREATE TRIGGER ${name} BEFORE INSERT ON ${voteTable}
      FOR EACH ROW EXECUTE FUNCTION ${name}()`)
    try {
      return await execute()
    } finally {
      await write(`/* withRejectedPostCategoryVotes:dropTrigger */
        DROP TRIGGER ${name} ON ${voteTable}`)
    }
  } finally {
    await write(`/* withRejectedPostCategoryVotes:dropFunction */ DROP FUNCTION ${name}()`)
  }
}

/** Reads the fixture actor's committed rows from the primary after a failed admission. */
export async function getPostCategoryMutationCounts(actorId: string) {
  const statement = sql`/* getPostCategoryMutationCounts */ SELECT
    (SELECT count(*)::integer FROM posts WHERE created_by_id = ${actorId}) AS posts,
    (SELECT count(*)::integer FROM post_revisions WHERE revised_by_id = ${actorId}) AS revisions,
    (SELECT count(*)::integer FROM post_slugs
      JOIN posts ON posts.id = post_slugs.post_id
      WHERE posts.created_by_id = ${actorId}) AS slugs,
    (SELECT count(*)::integer FROM relation__post__category__topic
      WHERE created_by_id = ${actorId}) AS topic_relations,
    (SELECT count(*)::integer FROM relation__post__category__topic_alias
      WHERE created_by_id = ${actorId}) AS hashtag_relations,
    (SELECT count(*)::integer FROM post_topic_alias_sources
      WHERE contributor_user_id = ${actorId}) AS hashtag_sources,
    (SELECT count(*)::integer FROM `
  statement.append(voteTable)
  statement.append(sql` WHERE user_id = ${actorId}) AS topic_votes,
    (SELECT count(*)::integer FROM `)
  statement.append(hashtagVoteTable)
  statement.append(sql` WHERE user_id = ${actorId}) AS hashtag_votes`)
  const { rows } = await write<{
    posts: number
    revisions: number
    slugs: number
    topic_relations: number
    hashtag_relations: number
    hashtag_sources: number
    topic_votes: number
    hashtag_votes: number
  }>(statement)
  return rows[0]!
}
