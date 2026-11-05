import { v7 as uuidv7 } from 'uuid'
import { write } from '@data-stores/psql'
import type { UrlFlagCursor } from '@queues/hacker-news-flags/types'
import { recomputeHackerNewsFlags } from '@services/hacker-news-flags'
const ZERO_ID = '00000000-0000-0000-0000-000000000000'

/** One indexed page per attempt; canonical traversal retains only two ancestor frames. */
export async function refreshUrlHackerNewsFlags(
  cursor: UrlFlagCursor,
  size: number,
): Promise<UrlFlagCursor | null> {
  const data = { ...cursor, upperId: cursor.upperId ?? uuidv7() }
  const phase = data.phase ?? 'posts'
  if (phase === 'aliases') return nextAlias(data)
  const ids = await readUrlDependents(
    data.urlId,
    phase,
    data.afterId ?? ZERO_ID,
    size,
    data.upperId,
  )
  await recomputeHackerNewsFlags(phase === 'rss' ? { rssFeedItemIds: ids } : { postIds: ids })
  if (ids.length === size) return { ...data, phase, afterId: ids.at(-1) }
  return {
    ...data,
    phase: phase === 'posts' ? 'related' : phase === 'related' ? 'rss' : 'aliases',
    afterId: undefined,
  }
}
async function readUrlDependents(
  urlId: string,
  phase: 'posts' | 'related' | 'rss',
  afterId: string,
  size: number,
  upperId: string,
): Promise<string[]> {
  const sql =
    phase === 'posts'
      ? `/* pageHackerNewsOwnUrlPosts */ SELECT id FROM posts WHERE url_id = $1 AND post_type = 'link' AND deleted_at IS NULL AND id > $2 AND id <= $4 ORDER BY id LIMIT $3`
      : phase === 'related'
        ? `/* pageHackerNewsRelatedUrlPosts */ SELECT subject_id AS id FROM relation__post__related__url WHERE object_id = $1 AND deleted_at IS NULL AND votes_score_net > 0 AND subject_id > $2 AND subject_id <= $4 ORDER BY subject_id LIMIT $3`
        : `/* pageHackerNewsUrlRssItems */ SELECT id FROM rss_feed_items WHERE url_id = $1 AND id > $2 AND id <= $4 ORDER BY id LIMIT $3`
  const page = await write<{ id: string }>(sql, [urlId, afterId, size, upperId])
  return page.rows.map(row => row.id)
}
async function nextAlias(data: UrlFlagCursor): Promise<UrlFlagCursor | null> {
  const parents = data.parents ?? []
  if (parents.length < 2) {
    const page = await write<{ id: string }>(
      `/* pageHackerNewsCanonicalAliases */ SELECT id FROM urls WHERE canonical_url_id = $1 AND id > $2 AND id <= $3 ORDER BY id LIMIT 1`,
      [data.urlId, data.afterAliasId ?? ZERO_ID, data.upperId],
    )
    const alias = page.rows[0]?.id
    if (alias)
      return {
        kind: 'url',
        urlId: alias,
        upperId: data.upperId,
        parents: [...parents, { urlId: data.urlId, afterAliasId: alias }],
      }
  }
  const parent = parents.at(-1)
  return parent
    ? {
        kind: 'url',
        upperId: data.upperId,
        ...parent,
        phase: 'aliases',
        parents: parents.slice(0, -1),
      }
    : null
}
