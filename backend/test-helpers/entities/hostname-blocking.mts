import { write } from '@data-stores/psql'

export async function insertTestPostRelatedUrlBatch(options: {
  postIds: string[]
  urlIds: string[]
  hostname: string
  hostnameId: string
  createdById: string
}): Promise<void> {
  await write(
    `/* insertTestPostRelatedUrlBatch */
    WITH input AS (
      SELECT * FROM unnest($1::uuid[], $2::uuid[]) AS batch(post_id, url_id)
    ), inserted_urls AS (
      INSERT INTO urls (id, url, hostname_id, pathname, search_params, created_by_id)
      SELECT url_id, 'https://' || $3 || '/batch-' || url_id::text, $4,
        '/batch-' || url_id::text, '{}'::jsonb, $5
      FROM input
    )
    INSERT INTO relation__post__related__url
      (subject_id, object_id, created_by_id, votes_score_up, votes_count_up)
    SELECT post_id, url_id, $5, 1, 1 FROM input`,
    [options.postIds, options.urlIds, options.hostname, options.hostnameId, options.createdById],
  )
}
