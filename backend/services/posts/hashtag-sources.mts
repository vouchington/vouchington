import type { QueryOptions } from '@data-stores/psql/types'
import { write } from '@data-stores/psql'
import type { HashtagSource } from './hashtag-occurrences.mts'

export type ExistingHashtagSource = {
  contributor_id: string
  source: HashtagSource
  topic_alias_id: string
  authored_token: string
}

export type PostHashtagSource = {
  aliasId: string
  contributorId: string
  source: HashtagSource
  authored: string
}

export function getExistingExplicitHashtags(sources: ExistingHashtagSource[]): string[] {
  const hashtags: string[] = []
  for (const source of sources) {
    if (source.source === 'explicit') hashtags.push(source.authored_token)
  }
  return hashtags
}

export async function getExistingHashtagSources(
  postId: string,
  options: QueryOptions,
): Promise<ExistingHashtagSource[]> {
  const { rows } = await write<ExistingHashtagSource>(
    `/* getExistingHashtagSources */
      SELECT contributor_id, source, topic_alias_id, authored_token
      FROM post_topic_alias_sources
      WHERE post_id = $1`,
    [postId],
    options,
  )
  return rows
}

export async function replacePostHashtagSources(
  postId: string,
  sources: PostHashtagSource[],
  options: QueryOptions,
): Promise<void> {
  await write(
    `/* syncPostHashtagCategoriesInTransaction.clearSources */ DELETE FROM post_topic_alias_sources WHERE post_id = $1`,
    [postId],
    options,
  )
  if (sources.length === 0) return
  await write(
    `/* syncPostHashtagCategoriesInTransaction.insertSources */
      INSERT INTO post_topic_alias_sources (post_id, topic_alias_id, contributor_id, source, authored_token)
      SELECT $1, topic_alias_id, contributor_id, source, authored_token
      FROM unnest($2::uuid[], $3::uuid[], $4::text[], $5::text[]) AS input(
        topic_alias_id,
        contributor_id,
        source,
        authored_token
      )`,
    [
      postId,
      sources.map(source => source.aliasId),
      sources.map(source => source.contributorId),
      sources.map(source => source.source),
      sources.map(source => source.authored),
    ],
    options,
  )
}
