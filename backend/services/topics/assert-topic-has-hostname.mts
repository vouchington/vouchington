import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { isUUID } from '@modules/utils'
import assert from 'http-assert'

export async function assertTopicHasHostname(
  topicId: string,
  options: QueryOptions = {},
): Promise<void> {
  assert(isUUID(topicId), 422, 'topic_id must be a valid UUID')
  const { rows } = await read<{ hostname_id: string | null }>(
    `/* assertTopicHasHostname */
    -- no-mistakes-disable-next-line postgres-required-predicates: exact write target validation must reject merged topic IDs.
    SELECT hostname_id
    FROM topics
    WHERE id = $1::uuid
      AND deleted_at IS NULL
      AND merged_into_topic_id IS NULL`,
    [topicId],
    options,
  )
  const topic = rows[0]
  assert(topic, 422, 'Topic not found')
  assert(topic.hostname_id, 422, 'RSS feed topic must be linked to a hostname')
}
