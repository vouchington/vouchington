import type { TransactionQuery } from '@data-stores/psql/types'
import { relationLimitsMaxValues } from '@services/entity-relations/relation-limits-config'
import { blockedUrlIdsForHostnameBlocks } from '@services/hostname-blocking'
import { describe, expect, it } from 'vitest'
import { pruneStoryPostRelatedUrlsOutsidePrefix } from '../story-post-related-url-projection-prune.mts'
import type { ProjectionWork } from '../story-post-related-url-projection-types.mts'

const overCap = Array.from(
  { length: relationLimitsMaxValues.post_related_url + 1 },
  () => '00000000-0000-7000-8000-000000000001',
)

describe('story post related URL hard maximum', () => {
  it('rejects a hostname-block lookup above the post related URL hard maximum', async () => {
    await expect(blockedUrlIdsForHostnameBlocks(overCap)).rejects.toThrow(/post_related_url/)
  })

  it('rejects a prune whose admitted prefix exceeds the post related URL hard maximum', async () => {
    const work = { post_id: overCap[0] } as ProjectionWork
    await expect(
      pruneStoryPostRelatedUrlsOutsidePrefix({} as TransactionQuery, work, overCap[0]!, overCap),
    ).rejects.toThrow(/post_related_url/)
  })
})
