import { v7 as uuidv7 } from 'uuid'
import type { UrlFlagCursor } from '@queues/hacker-news-flags/types'
import { pagePostHackerNewsFlags } from '@services/posts/hacker-news-flag-pages'
import { pageRssHackerNewsFlags } from '@services/rss-feed-items/hacker-news-flag-pages'
import { nextHackerNewsCanonicalAlias } from '@services/urls/hacker-news-flag-pages'
import type { recomputeHackerNewsFlags } from './recompute.mts'
const ZERO_ID = '00000000-0000-0000-0000-000000000000'

/** One indexed page per attempt; canonical traversal retains only two ancestor frames. */
export async function refreshUrlHackerNewsFlags(
  cursor: UrlFlagCursor,
  size: number,
  recompute: typeof recomputeHackerNewsFlags,
): Promise<UrlFlagCursor | null> {
  const data = { ...cursor, upperId: cursor.upperId ?? uuidv7() }
  const phase = data.phase ?? 'posts'
  if (phase === 'aliases') return nextAlias(data)
  const afterId = data.afterId ?? ZERO_ID
  const ids =
    phase === 'rss'
      ? await pageRssHackerNewsFlags(data.urlId, afterId, data.upperId, size)
      : await pagePostHackerNewsFlags(
          phase === 'posts' ? 'own' : 'related',
          data.urlId,
          afterId,
          data.upperId,
          size,
        )
  await recompute(phase === 'rss' ? { rssFeedItemIds: ids } : { postIds: ids })
  if (ids.length === size) return { ...data, phase, afterId: ids.at(-1) }
  return {
    ...data,
    phase: phase === 'posts' ? 'related' : phase === 'related' ? 'rss' : 'aliases',
    afterId: undefined,
  }
}
async function nextAlias(data: UrlFlagCursor & { upperId: string }): Promise<UrlFlagCursor | null> {
  const parents = data.parents ?? []
  if (parents.length < 2) {
    const alias = await nextHackerNewsCanonicalAlias(
      data.urlId,
      data.afterAliasId ?? ZERO_ID,
      data.upperId,
    )
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
