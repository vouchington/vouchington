import { write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import type { RepairFlagCursor } from '@queues/hacker-news-flags/types'
import { recomputeHackerNewsFlags } from '@services/hacker-news-flags'

/** Recent entity reconciliation cannot repair arbitrarily old URL/relation changes. */
export async function repairHackerNewsFlags(
  data: RepairFlagCursor,
  size: number,
): Promise<RepairFlagCursor | null> {
  const phase = data.phase ?? 'posts'
  const upperId = data.upperId ?? uuidv7()
  const afterId = data.afterId ?? '00000000-0000-0000-0000-000000000000'
  const page = await write<{ id: string }>(
    phase === 'posts'
      ? `/* pageHackerNewsPostFlagRepair */ SELECT id FROM posts WHERE id > $1 AND id <= $2 ORDER BY id LIMIT $3`
      : `/* pageHackerNewsRssFlagRepair */ SELECT id FROM rss_feed_items WHERE id > $1 AND id <= $2 ORDER BY id LIMIT $3`,
    [afterId, upperId, size],
  )
  const ids = page.rows.map(row => row.id)
  await recomputeHackerNewsFlags(phase === 'posts' ? { postIds: ids } : { rssFeedItemIds: ids })
  if (ids.length === size) return { kind: 'repair', phase, upperId, afterId: ids.at(-1) }
  return phase === 'posts' ? { kind: 'repair', phase: 'rss', upperId } : null
}
