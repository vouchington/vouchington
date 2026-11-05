import { v7 as uuidv7 } from 'uuid'
import type { RepairFlagCursor } from '@queues/hacker-news-flags/types'
import { pagePostHackerNewsFlagRepair } from '@services/posts/hacker-news-flag-pages'
import { pageRssHackerNewsFlagRepair } from '@services/rss-feed-items/hacker-news-flag-pages'
import { recomputeHackerNewsFlags } from './recompute.mts'

/** Recent entity reconciliation cannot repair arbitrarily old URL/relation changes. */
export async function repairHackerNewsFlags(
  data: RepairFlagCursor,
  size: number,
): Promise<RepairFlagCursor | null> {
  const phase = data.phase ?? 'posts'
  const upperId = data.upperId ?? uuidv7()
  const afterId = data.afterId ?? '00000000-0000-0000-0000-000000000000'
  const ids =
    phase === 'posts'
      ? await pagePostHackerNewsFlagRepair(afterId, upperId, size)
      : await pageRssHackerNewsFlagRepair(afterId, upperId, size)
  await recomputeHackerNewsFlags(phase === 'posts' ? { postIds: ids } : { rssFeedItemIds: ids })
  if (ids.length === size) return { kind: 'repair', phase, upperId, afterId: ids.at(-1) }
  return phase === 'posts' ? { kind: 'repair', phase: 'rss', upperId } : null
}
