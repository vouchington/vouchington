import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPostCommunitiesRecord } from './post-communities-record.mts'

describe('getPostCommunitiesRecord', () => {
  const getCommunitiesByIdBatch = vi.fn<VitestLooseMock>()

  function getRecord(posts: Parameters<typeof getPostCommunitiesRecord>[0]) {
    return getPostCommunitiesRecord(posts, { getCommunitiesByIdBatch })
  }

  beforeEach(() => {
    getCommunitiesByIdBatch.mockReset()
  })

  it('returns community sidecar records for unique post community ids', async () => {
    getCommunitiesByIdBatch.mockResolvedValue([
      { id: 'community-1', name: 'Rewards', slug: 'rewards' },
      null,
    ])

    await expect(
      getRecord([
        { community_id: 'community-1' },
        { community_id: 'community-1' },
        { community_id: null },
        null,
      ]),
    ).resolves.toEqual({
      'community-1': { id: 'community-1', name: 'Rewards', slug: 'rewards' },
    })
    expect(getCommunitiesByIdBatch).toHaveBeenCalledWith(['community-1'])
  })

  it('skips the community lookup when no posts have a community id', async () => {
    await expect(getRecord([{ community_id: null }, null])).resolves.toEqual({})

    expect(getCommunitiesByIdBatch).not.toHaveBeenCalled()
  })
})
