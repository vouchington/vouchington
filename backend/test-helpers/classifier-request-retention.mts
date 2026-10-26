import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'

type Subject = 'post' | 'rss_feed_item'

/** A retained identity without its deleted live subject, pinned only by one request. */
export async function seedDeletedSubjectClassifierRequest(input: {
  classifierId: string
  subject: Subject
  settled: boolean
}): Promise<{ identityId: string; requestId: string }> {
  const identityId = uuidv7()
  const requestId = uuidv7()
  if (input.subject === 'post') {
    await write(sql`/* seedDeletedClassifierPostIdentity */
      INSERT INTO retained_post_identities (id) VALUES (${identityId})`)
  } else {
    await write(sql`/* seedDeletedClassifierFeedIdentity */
      INSERT INTO retained_rss_feed_item_identities (id) VALUES (${identityId})`)
  }
  await write(sql`/* seedDeletedSubjectClassifierRequest */
    INSERT INTO classifier_run_requests (
      id, classifier_id, post_id, rss_feed_item_id, input_sha256, no_work_at
    ) VALUES (
      ${requestId}, ${input.classifierId},
      ${input.subject === 'post' ? identityId : null},
      ${input.subject === 'rss_feed_item' ? identityId : null},
      ${randomBytes(32)}, ${input.settled ? new Date() : null}
    )`)
  return { identityId, requestId }
}

export async function readDeletedSubjectClassifierRequestFacts(input: {
  postIdentityId: string
  feedIdentityId: string
  requestIds: readonly string[]
}): Promise<{ requests: number; postRoot: number; feedRoot: number }> {
  const { rows } = await write<{ requests: number; postRoot: number; feedRoot: number }>(sql`
    /* readDeletedSubjectClassifierRequestFacts */ SELECT
      (SELECT count(*)::int FROM classifier_run_requests
        WHERE id = ANY(${[...input.requestIds]}::uuid[])) AS requests,
      (SELECT count(*)::int FROM retained_post_identities
        WHERE id = ${input.postIdentityId}) AS "postRoot",
      (SELECT count(*)::int FROM retained_rss_feed_item_identities
        WHERE id = ${input.feedIdentityId}) AS "feedRoot"`)
  return rows[0]!
}
