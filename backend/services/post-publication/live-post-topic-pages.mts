import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'

export const LIVE_POST_TOPIC_FAMILIES = [
  'post_data_topics',
  'post_review_topics',
  'post_topic_relations',
  'post_alias_relations',
  'post_alias_sources',
] as const
export type LivePostTopicFamily = (typeof LIVE_POST_TOPIC_FAMILIES)[number]

type TopicRow = { cursor: string; topic_id: string | null }

/** One indexed source page for the post's current topic identities. */
export async function listLivePostTopicPage(
  postId: string,
  family: LivePostTopicFamily,
  after: string | null,
): Promise<{ topicIds: string[]; cursor: string | null }> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  let rows: TopicRow[]
  if (family === 'post_alias_sources') {
    const [aliasId, source] = after ? (JSON.parse(after) as [string, string]) : [null, null]
    const result = await write<{ alias_id: string; source: string; topic_id: string | null }>(
      `/* listLivePostTopicPage:aliasSources */
      SELECT authored.topic_alias_id AS alias_id, authored.source,
        alias.topic_id
      FROM post_topic_alias_sources authored
      LEFT JOIN topic_aliases alias ON alias.id = authored.topic_alias_id
      WHERE authored.post_id = $1::uuid
        AND (authored.topic_alias_id, authored.source) >
          (COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid),
            $3::post_topic_alias_source_types)
      ORDER BY authored.topic_alias_id, authored.source LIMIT $4`,
      [postId, aliasId, source, limit],
    )
    rows = result.rows.map(row => ({
      cursor: JSON.stringify([row.alias_id, row.source]),
      topic_id: row.topic_id,
    }))
  } else {
    // This closed map cannot be influenced by job data beyond its named family.
    const source = {
      post_data_topics: {
        table: 'post_data_point_topics',
        subject: 'post_id',
        object: 'topic_id',
        join: '',
      },
      post_review_topics: {
        table: 'post_review_topic_ratings',
        subject: 'post_id',
        object: 'topic_id',
        join: '',
      },
      post_topic_relations: {
        table: 'relation__post__category__topic',
        subject: 'subject_id',
        object: 'object_id',
        join: '',
      },
      post_alias_relations: {
        table: 'relation__post__category__topic_alias',
        subject: 'subject_id',
        object: 'object_id',
        join: 'LEFT JOIN topic_aliases alias ON alias.id = source.object_id',
      },
    }[family]
    const topic = family === 'post_alias_relations' ? 'alias.topic_id' : `source.${source.object}`
    const active =
      family === 'post_topic_relations' || family === 'post_alias_relations'
        ? `AND source.deleted_at IS NULL${family === 'post_alias_relations' ? ' AND source.votes_score_net > 0' : ''}`
        : ''
    const result = await write<TopicRow>(
      `/* listLivePostTopicPage:${family} */
      SELECT source.${source.object}::text AS cursor, ${topic} AS topic_id
      FROM ${source.table} source ${source.join}
      WHERE source.${source.subject} = $1::uuid
        AND source.${source.object} > COALESCE($2::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        ${active}
      ORDER BY source.${source.object} LIMIT $3`,
      [postId, after, limit],
    )
    rows = result.rows
  }
  return {
    topicIds: [...new Set(rows.flatMap(row => (row.topic_id ? [row.topic_id] : [])))],
    cursor: rows.length === limit ? rows.at(-1)!.cursor : null,
  }
}
