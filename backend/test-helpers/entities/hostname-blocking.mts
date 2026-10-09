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
