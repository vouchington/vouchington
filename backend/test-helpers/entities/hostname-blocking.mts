import { write } from '@data-stores/psql'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { v7 as uuidv7 } from 'uuid'

export async function insertTestPostRelatedUrlBatch(options: {
  postIds: string[]
  urlIds: string[]
  hostname: string
  hostnameId: string
  createdById: string
  votesScoreUp?: 0 | 1
}): Promise<void> {
  const relationIds = options.postIds.map((postId, index) => {
    const parentTime = Math.max(
      getDateFromUUIDv7(postId)!.getTime(),
      getDateFromUUIDv7(options.urlIds[index]!)!.getTime(),
    )
    return uuidv7({ msecs: parentTime + 1 })
  })
  await write(
    `/* insertTestPostRelatedUrlBatch */
    WITH input AS (
      SELECT * FROM unnest($1::uuid[], $2::uuid[], $7::uuid[]) AS batch(post_id, url_id, relation_id)
    ), inserted_urls AS (
      INSERT INTO urls (id, url, hostname_id, pathname, search_params, created_by_id)
      SELECT url_id, 'https://' || $3 || '/batch-' || url_id::text, $4,
        '/batch-' || url_id::text, '{}'::jsonb, $5
      FROM input
    )
    INSERT INTO relation__post__related__url
      (id, subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
    SELECT relation_id, post_id, url_id, $5, $6::integer, $6::integer FROM input`,
    [
      options.postIds,
      options.urlIds,
      options.hostname,
      options.hostnameId,
      options.createdById,
      options.votesScoreUp ?? 1,
      relationIds,
    ],
  )
}

export async function insertTestTopicLandingPageUrlRelations(options: {
  topicIds: string[]
  urlId: string
  createdById: string
}): Promise<void> {
  await write(
    `/* insertTestTopicLandingPageUrlRelations */
    INSERT INTO relation__topic__landing_page__url (subject_id, object_id, created_by_id)
    SELECT topic_id, $2, $3
    FROM unnest($1::uuid[]) AS relation(topic_id)`,
    [options.topicIds, options.urlId, options.createdById],
  )
}

export async function insertTestHostnameBlockCleanupRoot(options: {
  blockId: string
  hostnameId: string
  blockedById: string
}): Promise<void> {
  await write(
    `/* insertTestHostnameBlockCleanupRoot */
    INSERT INTO url_hostname_blocks (
      id, url_hostname_id, blocked_by_id, blocked_source,
      relation_cleanup_root_block_id, relation_cleanup_blocked_hostname_count
    ) VALUES ($1, $2, $3, 'admin', $1, 1)`,
    [options.blockId, options.hostnameId, options.blockedById],
  )
}
