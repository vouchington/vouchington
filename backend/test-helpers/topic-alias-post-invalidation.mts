import { write } from '@data-stores/psql'

/** Adds an owned raw source independently of the derived alias relation. */
export async function insertAliasInvalidationSourceForTest(
  postId: string,
  topicAliasId: string,
  userId: string,
  source: 'title' | 'markdown' | 'explicit',
): Promise<void> {
  await write(
    `/* insertAliasInvalidationSourceForTest */
    INSERT INTO post_topic_alias_sources
      (post_id, topic_alias_id, contributor_user_id, source, authored_token)
    VALUES ($1::uuid, $2::uuid, $3::uuid, $4, '#owned-invalidation')`,
    [postId, topicAliasId, userId, source],
  )
}
